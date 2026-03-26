import {createServer} from "node:http";
import * as http from "node:http";

if(import.meta.main) {
  boot();
}

/*
  This is a very simple test reverse proxy implementation.
 */

const hostToDownstreamService: Record<string, string> = {
  'example.com': 'http://localhost:3000',
  'example.test': 'http://localhost:4000',
}

export function boot(opts: { port?: number } = {}) {
  const port = opts.port ?? process.env.PROXY_PORT ?? 8080

  const server = createServer((proxyRequest, proxyResponse) => {
    const host = proxyRequest.headers.host

    // Reject request if host is not in our proxy config.
    if(host == null || hostToDownstreamService[host] == null) {
      console.log(`Proxy request received - Host: ${host} - not found`)
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
      return;
    }

    // We have a valid downstream service. Proxy the incoming request to the downstream service.
    const downstreamService = hostToDownstreamService[host]
    console.log(`Proxy request received - Host: ${host} - host config found`)

    const upstreamUrl = new URL(proxyRequest.url ?? "/", downstreamService);
    const downstreamRequest = http.request(
      upstreamUrl,
      {
        method: proxyRequest.method,
        headers: proxyRequest.headers,
      },
      (downstreamResponse) => {
        if(downstreamResponse.statusCode) {
          proxyResponse.writeHead(downstreamResponse.statusCode, downstreamResponse.headers);
          downstreamResponse.pipe(proxyResponse);
        } else {
          proxyResponse.statusCode = 502;
          proxyResponse.end("Bad Gateway");
        }
      },
    );

    // Handle error.
    downstreamRequest.on("error", (error) => {
      console.error(error);
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
    });

    proxyRequest.pipe(downstreamRequest);
  });

  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });

  return server;
}
