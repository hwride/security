import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

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
  server1.app.use(
    express.static(fileURLToPath(new URL("./public", import.meta.url))),
  );

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
  app.all("/regular-endpoint", (_req, res) => {
    logger.info(`:${port} regular-endpoint request received`);
    res.setHeader("Content-Type", "text/plain");
    res.send(`This is a non CORS response message from ${port}.`);
  });
  app.all(
    "/cors-disabled-endpoint",
    cors({ origin: false }), // Disables CORS
    (_req, res) => {
      logger.info(`:${port} cors-disabled-endpoint request received`);
      res.setHeader("Content-Type", "text/plain");
      res.send(`This is a CORS-disabled response message from ${port}.`);
    },
  );
  app.all("/cors-all-allowed-endpoint", cors(), (_req, res) => {
    logger.info(`:${port} cors-all-allowed-endpoint request received`);
    res.setHeader("Content-Type", "text/plain");
    res.send(`This is a CORS-enabled response message from ${port}.`);
  });

  // Listen.
  const httpServer = app.listen(port, () => {
    logger.info(`CORS testing server listening on port ${port}`);
  });

  return { app, httpServer };
}
