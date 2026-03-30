import { readFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const server = createHttpsServer();
export const serverListening = startServer();

function createHttpsServer() {
  const serverPrivateKeyPath = getServerPrivateKeyPath();
  const serverSignedCertPath = getServerSignedCertPath();

  return createServer(
    {
      key: readFileSync(serverPrivateKeyPath),
      cert: readFileSync(serverSignedCertPath),
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

function getServerPrivateKeyPath() {
  return join(
    getCurrentDirectoryPath(),
    "..",
    "openssl-node-https-certs-demo",
    "build",
    "server",
    "server-private-key.key",
  );
}

function getServerSignedCertPath() {
  return join(
    getCurrentDirectoryPath(),
    "..",
    "openssl-node-https-certs-demo",
    "build",
    "server",
    "signed-cert.crt",
  );
}

function getCurrentDirectoryPath() {
  return dirname(fileURLToPath(import.meta.url));
}
