import { existsSync, readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";

const serverPort = 8080;

main().catch(handleFatalError);

async function main() {
  const buildDir = resolve(process.cwd(), "build-issued-cert");
  const privateKeyPath = resolve(buildDir, "private-key.key");
  const certPath = resolve(buildDir, "cert.crt");

  assertFileExists(
    privateKeyPath,
    "Private key not found. Generate certificates into ./build-issued-cert first.",
  );
  assertFileExists(
    certPath,
    "Certificate not found. Generate certificates into ./build-issued-cert first.",
  );

  const server = https.createServer(
    {
      cert: readFileSync(certPath),
      key: readFileSync(privateKeyPath),
    },
    function handleRequest(_request, response) {
      response.writeHead(200);
      response.end("HTTPS response");
    },
  );

  await new Promise<void>((resolve) => {
    server.listen(serverPort, resolve);
  });

  console.log(`HTTPS server listening at https://localhost:${serverPort}`);
  console.log(`Using certificate: ${certPath}`);
  console.log(`Using private key: ${privateKeyPath}`);

  process.on("SIGINT", () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

function assertFileExists(filePath: string, errorMessage: string) {
  if (existsSync(filePath)) {
    return;
  }

  throw new Error(`${errorMessage} Missing file: ${filePath}`);
}

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
