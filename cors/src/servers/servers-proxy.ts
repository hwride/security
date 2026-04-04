import { EventEmitter } from "node:events";

import { createLogger } from "../framework/logging.ts";
import type { ProxyServer } from "../types.ts";
import { boot } from "../../../proxy/forward-proxy.ts";

const logger = createLogger("servers-proxy");

export function setupProxyServer(proxyPort: number): ProxyServer {
  logger.info("Setting up proxy server...");
  return createProxy(proxyPort);
}

export function shutdownProxyServer({
  forwardProxy,
}: Pick<ProxyServer, "forwardProxy">): void {
  logger.info("Shutting down proxy server...");
  forwardProxy.close();
}

function createProxy(sourcePort: number): ProxyServer {
  const forwardProxy = boot({ port: sourcePort });

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
  forwardProxy.on("request", async function (req) {
    const body = await captureBody(req);
    ee.emit("request-finished", { req, body });
  });
  forwardProxy.on("response", async function (res) {
    const body = await captureBody(res);
    ee.emit("response-finished", { res, body });
  });

  return {
    forwardProxy,
    on: ee.on.bind(ee) as ProxyServer["on"],
    off: ee.off.bind(ee) as ProxyServer["off"],
  };
}
