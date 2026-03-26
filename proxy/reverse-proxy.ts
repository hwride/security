import { createServer } from "node:http";
import * as http from "node:http";

/*
  This is a very simple test reverse proxy implementation.
 */

type ProxyConfig = {
  port?: number;
  /** Mapping of Host header name to backend which should be sent those requests. */
  backendByHost: Record<string, string>;
};

export function boot(opts: ProxyConfig) {
  const port = opts.port ?? process.env.PROXY_PORT ?? 8080;
  const { backendByHost } = opts;

  const server = createServer((proxyRequest, proxyResponse) => {
    const host = proxyRequest.headers.host;

    // Reject request if host is not in our proxy config.
    if (host == null || backendByHost[host] == null) {
      console.log(`Proxy request received - Host: ${host} - not found`);
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    // We have a valid backend. Proxy the incoming request to the backend service.
    const backendService = backendByHost[host];
    console.log(`Proxy request received - Host: ${host} - host config found`);

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
