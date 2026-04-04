import * as http from "node:http";
import { EventEmitter } from "node:events";

/*
  This is a very simple test forward proxy implementation.

  It works by proxying incoming requests to the destination specified by the
  absolute-form request target, e.g. GET http://example.com/path HTTP/1.1.
 */

export type ProxyConfig = {
  port: number;
};

export type ForwardProxy = {
  close: () => void;
  off: (
    eventName: "request" | "response",
    listener: (value: http.IncomingMessage) => void,
  ) => ForwardProxy;
  on: (
    eventName: "request" | "response",
    listener: (value: http.IncomingMessage) => void,
  ) => ForwardProxy;
  server: http.Server;
};

export function boot({ port }: ProxyConfig) {
  const events = new EventEmitter();
  const server = http.createServer((clientRequest, proxyResponse) => {
    events.emit("request", clientRequest);

    const requestTarget = clientRequest.url;
    if (requestTarget == null) {
      proxyResponse.statusCode = 400;
      proxyResponse.end("Bad Request");
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(requestTarget);
    } catch (e) {
      console.error(`Error creating URL from proxy request: `, e);
      proxyResponse.statusCode = 400;
      proxyResponse.end("Bad Request");
      return;
    }

    if (targetUrl.protocol !== "http:") {
      console.error(`Only http: protocol is supported`);
      proxyResponse.statusCode = 400;
      proxyResponse.end("Bad Request");
      return;
    }

    // Make a request to the upstream destination.
    const backendRequest = http.request(
      {
        headers: {
          ...clientRequest.headers,
        },
        hostname: targetUrl.hostname,
        port: targetUrl.port.length === 0 ? 80 : Number(targetUrl.port),
        method: clientRequest.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
      },
      (backendResponse) => {
        events.emit("response", backendResponse);

        proxyResponse.writeHead(
          backendResponse.statusCode ?? 502,
          backendResponse.headers,
        );
        backendResponse.pipe(proxyResponse);
      },
    );

    backendRequest.on("error", (error) => {
      if (error != null) {
        console.error(`Backend request error: `, error);
      }
      proxyResponse.statusCode = 502;
      proxyResponse.end("Bad Gateway");
    });

    clientRequest.pipe(backendRequest);
  });

  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });

  const forwardProxy: ForwardProxy = {
    close: () => {
      server.close();
    },
    off: (eventName, listener) => {
      events.off(eventName, listener);
      return forwardProxy;
    },
    on: (eventName, listener) => {
      events.on(eventName, listener);
      return forwardProxy;
    },
    server,
  };

  return forwardProxy;
}
