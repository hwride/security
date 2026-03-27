import { createServer } from "node:http";
import * as http from "node:http";

/*
  This is a very simple test reverse proxy implementation.

  It works by proxying incoming requests to different backends according to their Host header.
 */

export type ProxyConfig = {
  port?: number;
  /** Mapping of hostname to backend which should be sent those requests. */
  backends: Record<string, BackendConfig>;
};

export type BackendConfig = {
  servers: ServerConfig[];
  policy?: "random";
};

export type ServerConfig = {
  url: string;
};

export function boot(opts: ProxyConfig) {
  const port = opts.port ?? process.env.PROXY_PORT ?? 8080;
  const { backends } = opts;

  const server = createServer((proxyRequest, proxyResponse) => {
    const hostHeader = proxyRequest.headers.host;
    const hostname =
      hostHeader == null ? null : getHostnameFromHostHeader(hostHeader);

    // Reject request if host is not in our proxy config.
    const backendConfig = hostname == null ? null : backends[hostname];
    if (backendConfig == null) {
      console.log(`Proxy request received - Host: ${hostHeader} - not found`);
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    // We have a valid backend. Proxy the incoming request to the backend service.
    const selectedServer = selectServer(backendConfig);
    if (selectedServer == null) {
      console.log(
        `Proxy request received - Host: ${hostHeader} - no servers configured`,
      );
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    const backendService = selectedServer.url;
    console.log(
      `Proxy request received - Host: ${hostHeader} - host config found`,
    );

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

    const backendUrl = new URL(proxyRequest.url ?? "/", backendService);
    const backendRequest = http.request(
      backendUrl,
      {
        method: proxyRequest.method,
        headers: forwardedHeaders,
      },
      (backendResponse) => {
        if (backendResponse.statusCode) {
          proxyResponse.writeHead(
            backendResponse.statusCode,
            backendResponse.headers,
          );
          backendResponse.pipe(proxyResponse);
        } else {
          proxyResponse.statusCode = 502;
          proxyResponse.end("Bad Gateway");
        }
      },
    );

    // Handle error.
    backendRequest.on("error", (error) => {
      console.error(error);
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
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

function selectServer(backendConfig: BackendConfig) {
  if (backendConfig.servers.length === 0) {
    return null;
  }

  if (backendConfig.policy === "random") {
    const serverIndex = Math.floor(Math.random() * backendConfig.servers.length);
    return backendConfig.servers[serverIndex] ?? null;
  }

  return backendConfig.servers[0] ?? null;
}
