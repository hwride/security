import { fileURLToPath } from "node:url";

import cors from "cors";
import express, { type Express, type RequestHandler } from "express";

import { createLogger } from "../framework/logging.ts";
import type { MainServers, RunningServer } from "../types.ts";

const logger = createLogger("servers-main");

export function setupMainServers(
  server1Port: number,
  server2Port: number,
): MainServers {
  // Server 1 is be the origin server, it will server the HTML of the main page.
  logger.info("Setting up server 1...");
  const server1 = createServer(server1Port);
  setupPublicDir(server1.app);

  // Server 2 is the cross-origin server.
  logger.info("Setting up server 2...");
  const server2 = createServer(server2Port);

  return { server1, server2 };
}

export function shutdownMainServers({ server1, server2 }: MainServers): void {
  logger.info("Shutting down server 1...");
  server1.httpServer.close();
  logger.info("Shutting down server 2...");
  server2.httpServer.close();
}

function createServer(port: number): RunningServer {
  const app = express();

  // Setup endpoints.
  app.all(
    "/regular-endpoint",
    createTextHandler(port, "regular-endpoint", "non CORS"),
  );
  app.all(
    "/cors-disabled-endpoint",
    cors({ origin: false }), // Disables CORS
    createTextHandler(port, "cors-disabled-endpoint", "CORS-disabled"),
  );
  app.all(
    "/cors-all-allowed-endpoint",
    cors(),
    createTextHandler(port, "cors-all-allowed-endpoint", "CORS-enabled"),
  );

  // Listen.
  const httpServer = app.listen(port, () => {
    logger.info(`CORS testing server listening on port ${port}`);
  });

  return { app, httpServer };
}

function setupPublicDir(app: Express): void {
  const publicDir = fileURLToPath(new URL("./public", import.meta.url));
  app.use(express.static(publicDir));
}

function createTextHandler(
  port: number,
  endpointName: string,
  responseDescriptor: string,
): RequestHandler {
  return (_req, res) => {
    logger.info(`:${port} ${endpointName} request received`);
    res.setHeader("Content-Type", "text/plain");
    res.send(`This is a ${responseDescriptor} response message from ${port}.`);
  };
}
