import { createServer } from "node:http";
import * as http from "node:http";
import * as https from "node:https";
import type { TlsOptions } from "node:tls";

/*
  This is a very simple test reverse proxy implementation.

  It works by proxying incoming requests to different backends according to their Host header.
 */

export type ProxyConfig = {
  port?: number;
  /**
   * Protocol used for client -> proxy connections.
   * - http (default)
   * - https (TLS termination at the proxy)
   */
  proxyProtocol?: "http" | "https";
  /**
   * TLS certificate options used when proxyProtocol is "https".
   */
  tls?: TlsOptions;
  /**
   * Idle timeout in milliseconds for requests to backend servers.
   * This currently covers inactivity on the proxied backend request.
   * In future, this could be split into separate connect, first-byte, and idle timeouts.
   * When exceeded, the proxy returns 504 Gateway Timeout.
   * Defaults to 30 seconds.
   */
  backendRequestTimeoutMs?: number;
  /**
   * Map of hostname to backends to that should receive requests for that hostname.
   *
   * A backend can contain multiple servers.
   */
  backends: Record<string, BackendConfig>;
};

export type BackendConfig = {
  /** Servers that will receive requests for this backend. */
  servers: ServerConfig[];
  /**
   * Policy to use when load balancing between multiple servers.
   * - random: Choose a random server.
   */
  loadBalancingPolicy?: "random";
};

export type ServerConfig = {
  url: string;
};

const DEFAULT_BACKEND_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_PROXY_PORT = 80;
const DEFAULT_HTTPS_PROXY_PORT = 443;

export function boot(opts: ProxyConfig) {
  const { backends } = opts;
  const proxyProtocol = opts.proxyProtocol ?? "http";
  const port =
    opts.port ??
    process.env.PROXY_PORT ??
    getDefaultPortForProxyProtocol(proxyProtocol);
  const tlsOptions = opts.tls;
  const backendRequestTimeoutMs =
    opts.backendRequestTimeoutMs ?? DEFAULT_BACKEND_REQUEST_TIMEOUT_MS;

  if (
    proxyProtocol === "https" &&
    (tlsOptions?.key == null || tlsOptions?.cert == null)
  ) {
    throw new Error(
      'ProxyConfig.tls must include both "key" and "cert" when proxyProtocol is "https"',
    );
  }

  const requestHandler: http.RequestListener = (
    clientRequest,
    proxyResponse,
  ) => {
    // Request state.
    let state:
      | { status: "pending" }
      | { status: "response-status-sent"; responseType: "success" | "error" } =
      {
        status: "pending",
      };

    /** Small util to ensure we only try and send a response once. */
    const sendResponseOnce = (
      responseType: "success" | "error",
      cb: () => void,
    ) => {
      if (state.status === "response-status-sent") {
        return;
      } else {
        state = { status: "response-status-sent", responseType };
        cb();
      }
    };

    /** Send a proxy error response with some simple text. */
    const sendGatewayError = (statusCode: number, message: string) => {
      sendResponseOnce("error", () => {
        proxyResponse.statusCode = statusCode;
        proxyResponse.end(message);
      });
    };

    // The Host header includes hostname and may include port
    // The hostname does not include port
    const hostHeader = clientRequest.headers.host;
    const hostname =
      hostHeader == null ? null : getHostnameFromHostHeader(hostHeader);

    if (hostHeader == null || hostname == null) {
      console.error(
        `Proxy request received - Host: ${hostHeader} - invalid host`,
      );
      proxyResponse.statusCode = 400;
      proxyResponse.end("Bad Request");
      return;
    }

    // Check request path is acceptable.
    const validatedRequestPath = getValidatedRequestPath(clientRequest.url);
    if (validatedRequestPath == null) {
      sendGatewayError(400, "Bad Request");
      return;
    }

    // Check if we have a valid server from this hostname, and apply any load balancing policy.
    const serverDetails = getServerDetails({
      backends,
      hostname,
    });
    if (serverDetails == null) {
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    /** Central util to handle any kind of failures communicating with the backend.  */
    const handleBackendFailure = ({
      error,
      message = "Bad Gateway",
      statusCode = 502,
    }: {
      error?: unknown;
      message?: string;
      statusCode?: number;
    } = {}) => {
      if (error != null) {
        console.error(error);
      }

      // If we've not sent a response yet, send back an error response.
      if (state.status === "pending") {
        sendGatewayError(statusCode, message);
        return;
      }
      // Otherwise a response has already been sent.
      // If it's an error response, then we're fine, the error has already been communicated back to the client.
      // But if we've started a successful response, we can't now send a new error status code and headers because you
      // only send these once per request. So handle it by just closing the connection to the client early, to alert
      // them there's a problem as soon as possible.
      // Note specifically only destroying if it's a success response that's already begun, because that might still
      // be streaming and we want to exit early after detecting an error. We don't want to close the connection on error
      // because we want the error response to make it back to the client.
      else if (
        state.status === "response-status-sent" &&
        state.responseType === "success" &&
        !proxyResponse.destroyed
      ) {
        proxyResponse.destroy();
      }
    };

    // Prepare headers.
    const forwardedHeaders = getProxiedRequestHeaders({
      proxyRequest: clientRequest,
      hostHeader,
      proxyProtocol,
    });

    // Make request to backend.
    const requestOpts = {
      method: clientRequest.method,
      protocol: serverDetails.protocol,
      hostname: serverDetails.hostname,
      port: serverDetails.port,
      path: validatedRequestPath,
      headers: forwardedHeaders,
    };
    console.log(
      `Proxy request received - Host: ${hostHeader} - sending to ${JSON.stringify(requestOpts, null, 2)}`,
    );
    const backendRequest = http.request(requestOpts, (backendResponse) => {
      backendResponse.on("close", () => {
        /* Close can trigger:
            1. When the request succeeds and the socket is closed.
            2. When the socket was closed before the HTTP request finished.
           We only want to trigger a failure in scenario 2. */
        if (!backendResponse.complete) {
          handleBackendFailure();
        }
      });
      backendResponse.on("error", (error) => {
        handleBackendFailure({
          error,
        });
      });

      // If we get a status code from the backend, send code & headers, then start streaming the response body.
      if (backendResponse.statusCode) {
        const { statusCode, headers } = backendResponse;
        sendResponseOnce("success", () => {
          proxyResponse.writeHead(statusCode, headers);
          backendResponse.pipe(proxyResponse);
        });
      } else {
        sendGatewayError(502, "Bad Gateway");
      }
    });

    // Timeout the proxy request
    backendRequest.setTimeout(backendRequestTimeoutMs, () => {
      // Handle the timeout before destroying the upstream request so any follow-on backendRequest 'error' event cannot
      // win the race and downgrade this timeout into a generic 502 response.
      handleBackendFailure({
        message: "Gateway Timeout",
        statusCode: 504,
      });
      // This will close the TCP connection and release the socket to the backend.
      backendRequest.destroy(new Error("Backend request timed out"));
    });

    // Handle request errors.
    backendRequest.on("error", (error) => {
      handleBackendFailure({
        error,
      });
    });

    // Proxy the client request data to the backend request.
    clientRequest.pipe(backendRequest);
  };

  const server =
    proxyProtocol === "https"
      ? https.createServer(
          // TLS options are validated above for HTTPS mode.
          tlsOptions as TlsOptions,
          requestHandler,
        )
      : createServer(requestHandler);

  server.listen(port, () => {
    console.log(`Listening on ${proxyProtocol}://localhost:${port}`);
  });

  return server;
}

function getDefaultPortForProxyProtocol(proxyProtocol: "http" | "https") {
  return proxyProtocol === "https"
    ? DEFAULT_HTTPS_PROXY_PORT
    : DEFAULT_HTTP_PROXY_PORT;
}

function getHostnameFromHostHeader(hostHeader: string) {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Get the final server to use.
 *
 * - Finds an appropriate backend for the given hostname.
 * - If a load balancing policy exists applies that.
 */
function getServerDetails({
  backends,
  hostname,
}: {
  backends: Record<string, BackendConfig>;
  hostname: string;
}) {
  const backendConfig = backends[hostname];
  if (backendConfig == null) {
    console.error(
      `Proxy request received - hostname: ${hostname} - no backend configured`,
    );
    return null;
  }

  if (backendConfig.servers.length === 0) {
    console.error(
      `Proxy request received - hostname: ${hostname} - no servers configured`,
    );
    return null;
  }

  let selectedServer: ServerConfig;

  // Apply load balancing policy.
  if (backendConfig.loadBalancingPolicy === "random") {
    const serverIndex = Math.floor(
      Math.random() * backendConfig.servers.length,
    );
    selectedServer = backendConfig.servers[serverIndex];
  } else {
    selectedServer = backendConfig.servers[0];
  }

  if (selectedServer != null) {
    const serverUrl = new URL(selectedServer.url);

    return {
      protocol: "http:",
      hostname: serverUrl.hostname,
      port: serverUrl.port,
    };
  } else {
    return null;
  }
}

/**
 * Get the headers that should be used for requests to our backends.
 */
function getProxiedRequestHeaders({
  proxyRequest,
  hostHeader,
  proxyProtocol,
}: {
  proxyRequest: http.IncomingMessage;
  hostHeader: string;
  proxyProtocol: "http" | "https";
}) {
  const forwardedHeaders: http.OutgoingHttpHeaders = {
    ...proxyRequest.headers,
  };
  delete forwardedHeaders["x-forwarded-for"];
  delete forwardedHeaders["x-forwarded-host"];
  delete forwardedHeaders["x-forwarded-proto"];
  delete forwardedHeaders["forwarded"];

  const remoteAddress = proxyRequest.socket.remoteAddress;
  if (remoteAddress != null) {
    forwardedHeaders["x-forwarded-for"] = remoteAddress;
  }
  forwardedHeaders["x-forwarded-host"] = hostHeader;
  forwardedHeaders["x-forwarded-proto"] = proxyProtocol;

  return forwardedHeaders;
}

/**
 * Validate the incoming request path from the client. Only supports origin-form request targets.
 */
function getValidatedRequestPath(requestPath: string | undefined) {
  const normalizedRequestPath = requestPath ?? "/";
  if (
    !normalizedRequestPath.startsWith("/") ||
    normalizedRequestPath.startsWith("//")
  ) {
    console.error(
      `Proxy request received - rejected non-origin-form request target: ${normalizedRequestPath}`,
    );
    return null;
  }

  return normalizedRequestPath;
}
