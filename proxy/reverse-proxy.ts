import { createServer } from "node:http";
import * as http from "node:http";

/*
  This is a very simple test reverse proxy implementation.

  It works by proxying incoming requests to different backends according to their Host header.
 */

export type ProxyConfig = {
  port?: number;
  /**
   * Idle timeout in milliseconds for requests to backend servers.
   * This currently covers inactivity on the proxied backend request.
   * In future, this could be split into separate connect, first-byte, and idle timeouts.
   * When exceeded, the proxy returns 504 Gateway Timeout.
   * Defaults to 30 seconds.
   */
  backendRequestTimeoutMs?: number;
  /** Different backends this proxy can send requests to. Key is the hostname that should be proxied. */
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

export function boot(opts: ProxyConfig) {
  const port = opts.port ?? process.env.PROXY_PORT ?? 8080;
  const { backends } = opts;
  const backendRequestTimeoutMs =
    opts.backendRequestTimeoutMs ?? DEFAULT_BACKEND_REQUEST_TIMEOUT_MS;

  const server = createServer((proxyRequest, proxyResponse) => {
    const hostHeader = proxyRequest.headers.host;
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

    const selectedServer = selectServer({
      backends,
      hostname,
    });
    if (selectedServer == null) {
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    console.log(
      `Proxy request received - Host: ${hostHeader} - host config found`,
    );

    const forwardedHeaders = getRequestHeaders({
      proxyRequest,
      hostHeader,
    });

    // Flag to prevent any race conditions on callbacks trying to respond twice.
    let responseSent = false;
    let successResponseStarted = false;
    let backendFailureHandled = false;

    const sendResponseOnce = (cb: () => void) => {
      if (responseSent) {
        return;
      } else {
        responseSent = true;
        cb();
      }
    };

    // Send a proxy response with some simple text.
    const sendGatewayError = (statusCode: number, message: string) => {
      sendResponseOnce(() => {
        proxyResponse.statusCode = statusCode;
        proxyResponse.end(message);
      });
    };

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

      if (backendFailureHandled) {
        return;
      }
      backendFailureHandled = true;

      // If we've already sent status code + headers for a successful response, we can't now send a new error status
      // code and headers because you only send these once per request.
      // But we've detected an error from the backend. So handle it by just closing the connection to the client early,
      // to alert them there's a problem as soon as possible.
      // Note specifically not using !proxyResponse.destroyed as the flag, because we don't want to accidentally
      // destroy the proxy response if two error events come in, the first sets a successful error response, then
      // the second accidentally destroys the connection.
      if (successResponseStarted) {
        proxyResponse.destroy();
        return;
      }

      sendGatewayError(statusCode, message);
    };

    const serverDetails = getServerDetails({
      selectedServer,
      requestTarget: proxyRequest.url,
    });
    if (serverDetails == null) {
      sendGatewayError(400, "Bad Request");
      return;
    }

    // Make request to backend.
    const backendRequest = http.request(
      {
        method: proxyRequest.method,
        protocol: serverDetails.protocol,
        hostname: serverDetails.hostname,
        port: serverDetails.port,
        path: serverDetails.path,
        headers: forwardedHeaders,
      },
      (backendResponse) => {
        backendResponse.on("close", () => {
          if (!backendResponse.complete) {
            handleBackendFailure();
          }
        });
        backendResponse.on("error", (error) => {
          handleBackendFailure({
            error,
          });
        });

        if (backendResponse.statusCode) {
          const statusCode = backendResponse.statusCode;
          successResponseStarted = true;
          sendResponseOnce(() => {
            proxyResponse.writeHead(statusCode, backendResponse.headers);
            backendResponse.pipe(proxyResponse);
          });
        } else {
          sendGatewayError(502, "Bad Gateway");
        }
      },
    );

    // Timeout the proxy request
    backendRequest.setTimeout(backendRequestTimeoutMs, () => {
      // This will close the TCP connection and release the socket.
      backendRequest.destroy(new Error("Backend request timed out"));
      handleBackendFailure({
        message: "Gateway Timeout",
        statusCode: 504,
      });
    });

    // Handle request errors.
    backendRequest.on("error", (error) => {
      handleBackendFailure({
        error,
      });
    });

    proxyRequest.pipe(backendRequest);
  });

  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });

  return server;
}

function getHostnameFromHostHeader(hostHeader: string) {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

function selectServer({
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

  if (backendConfig.loadBalancingPolicy === "random") {
    const serverIndex = Math.floor(
      Math.random() * backendConfig.servers.length,
    );
    return backendConfig.servers[serverIndex] ?? null;
  }

  return backendConfig.servers[0] ?? null;
}

/**
 * Get the headers that should be used for requests to our backends.
 */
function getRequestHeaders({
  proxyRequest,
  hostHeader,
}: {
  proxyRequest: http.IncomingMessage;
  hostHeader: string;
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
  forwardedHeaders["x-forwarded-proto"] = "http";

  return forwardedHeaders;
}

/**
 * Get the final server details to use for the call.
 *
 * Ensures absolute URLs can't sneakily change the target host.
 */
function getServerDetails({
  selectedServer,
  requestTarget,
}: {
  selectedServer: ServerConfig;
  requestTarget: string | undefined;
}) {
  const normalizedRequestTarget = requestTarget ?? "/";
  if (
    !normalizedRequestTarget.startsWith("/") ||
    normalizedRequestTarget.startsWith("//")
  ) {
    console.error(
      `Proxy request received - rejected non-origin-form request target: ${normalizedRequestTarget}`,
    );
    return null;
  }

  const serverUrl = new URL(selectedServer.url);

  return {
    protocol: "http:",
    hostname: serverUrl.hostname,
    port: serverUrl.port,
    path: normalizedRequestTarget,
  };
}
