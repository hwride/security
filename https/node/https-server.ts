import { existsSync, readFileSync } from "node:fs";
import * as https from "node:https";
import { join, resolve } from "node:path";

const serverPort = 8080;

main().catch(handleFatalError);

async function main() {
  const buildDir = resolve(process.cwd(), "build-server");
  const serverPrivateKeyPath = join(
    buildDir,
    "server",
    "server-private-key.key",
  );
  const serverSignedCertPath = join(buildDir, "server", "signed-cert.crt");

  assertFileExists(
    serverPrivateKeyPath,
    "Server private key not found. Generate certificates into ./build-server first.",
  );
  assertFileExists(
    serverSignedCertPath,
    "Server certificate not found. Generate certificates into ./build-server first.",
  );

  const server = https.createServer(
    {
      cert: readFileSync(serverSignedCertPath),
      key: readFileSync(serverPrivateKeyPath),
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
  console.log(`Using certificate: ${serverSignedCertPath}`);
  console.log(`Using private key: ${serverPrivateKeyPath}`);

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
