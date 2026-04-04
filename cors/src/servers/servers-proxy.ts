import { EventEmitter } from "node:events";
import * as http from "node:http";

import httpProxy from "http-proxy";

import { createLogger } from "../framework/logging.ts";
import type {
  ProxyServer,
} from "../types.ts";

const logger = createLogger("servers-proxy");

export function setupProxyServer(proxyPort: number): ProxyServer {
  logger.info("Setting up proxy server...");
  return createProxy(proxyPort);
}

export function shutdownProxyServer({
  nodeHTTPProxy,
  httpServer,
}: Pick<ProxyServer, "nodeHTTPProxy" | "httpServer">): void {
  logger.info("Shutting down proxy server...");
  nodeHTTPProxy.close();
  httpServer.close();
}

function createProxy(sourcePort: number): ProxyServer {
  const nodeHTTPProxy = httpProxy.createProxyServer({});

  // Event listener utility functions.
  const ee = new EventEmitter({ captureRejections: true });
  // Handle uncaptured promise errors.
  (ee as unknown as Record<PropertyKey, unknown>)[
    Symbol.for("nodejs.rejection")
  ] = (error: unknown) => {
    logger.error(`Unhandled error occurred: ${String(error)}`);
  };

  // Listen for requests and responses.
  const captureBody = (listenObj: NodeJS.ReadableStream): Promise<string> => {
    const data: Buffer[] = [];
    return new Promise((resolve, reject) => {
      listenObj.on("data", (chunk: Buffer | string) => {
        data.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      listenObj.on("end", () => {
        resolve(Buffer.concat(data).toString());
      });
      listenObj.on("error", reject);
    });
  };
  nodeHTTPProxy.on("proxyReq", async function (proxyReq, req) {
    const body = await captureBody(req);
    ee.emit("request-finished", { proxyReq, req, body });
  });
  nodeHTTPProxy.on("proxyRes", async function (proxyRes, _req, res) {
    const body = await captureBody(proxyRes);
    ee.emit("response-finished", { proxyRes, res, body });
  });

  // Setup HTTP server to intercept requests and forward with the proxy.
  const httpServer = http.createServer((req, res) => {
    const protocolMatch = req.url?.match(/(\w+):/);
    const host = req.headers.host;

    if (protocolMatch == null || host == null) {
      res.statusCode = 400;
      res.end("Invalid proxy request URL.");
      return;
    }

    const target = `${protocolMatch[1]}://${host}`;
    nodeHTTPProxy.web(req, res, { target });
  });

  httpServer.listen(sourcePort);
  logger.info(`Proxy server listening on port ${sourcePort}...`);

  return {
    nodeHTTPProxy,
    httpServer,
    on: ee.on.bind(ee) as ProxyServer["on"],
    off: ee.off.bind(ee) as ProxyServer["off"],
  };
}
