import { readFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:https";

export const server = createHttpsServer();
export const serverListening = startServer();

function createHttpsServer() {
  return createServer(
    {
      key: readFileSync("private-key.key"),
      cert: readFileSync("signed-cert.crt"),
    },
    handleRequest,
  );
}

function startServer() {
  return new Promise<void>((resolve) => {
    server.listen(8080, resolve);
  });
}

function handleRequest(_request: IncomingMessage, response: ServerResponse) {
  response.writeHead(200);
  response.end("HTTPS response");
}
