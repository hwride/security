import { createServer } from "node:http";
import * as http from "node:http";

/*
  This is a very simple test reverse proxy implementation.

  It works by proxying incoming requests to different backends according to their Host header.
 */

export type ProxyConfig = {
  port?: number;
  /** Mapping of hostname to backend which should be sent those requests. */
  backendByHostname: Record<string, string>;
};

export function boot(opts: ProxyConfig) {
  const port = opts.port ?? process.env.PROXY_PORT ?? 8080;
  const { backendByHostname } = opts;

  const server = createServer((proxyRequest, proxyResponse) => {
    const hostHeader = proxyRequest.headers.host;
    const hostname =
      hostHeader == null ? null : getHostnameFromHostHeader(hostHeader);

    // Reject request if host is not in our proxy config.
    if (hostname == null || backendByHostname[hostname] == null) {
      console.log(`Proxy request received - Host: ${hostHeader} - not found`);
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    // We have a valid backend. Proxy the incoming request to the backend service.
    const backendService = backendByHostname[hostname];
    console.log(
      `Proxy request received - Host: ${hostHeader} - host config found`,
    );

    const backendUrl = new URL(proxyRequest.url ?? "/", backendService);
    const backendRequest = http.request(
      backendUrl,
      {
        method: proxyRequest.method,
        headers: proxyRequest.headers,
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
