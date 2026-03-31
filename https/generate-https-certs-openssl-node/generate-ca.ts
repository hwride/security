import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openssl } from "../openssl-node/openssl-node.ts";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  generateCa().catch(handleFatalError);
}

type GenerateCaOptions = {
  outputDirectoryPath?: string;
};

type GenerateCaResult = {
  caPrivateKeyPath: string;
  caRootCertPath: string;
};

export async function generateCa({
  outputDirectoryPath = resolve(process.cwd(), "build-ca"),
}: GenerateCaOptions = {}): Promise<GenerateCaResult> {
  await prepareCaDirectory(outputDirectoryPath);

  const caPrivateKeyPath = join(
    outputDirectoryPath,
    "certificate-authority",
    "ca-private-key.key",
  );
  const caRootCertPath = join(
    outputDirectoryPath,
    "certificate-authority",
    "ca-root.crt",
  );

  console.log("");
  console.log("-- Setting up Certificate Authority (CA) --");
  console.log("Generating CA private key...");
  await openssl("genrsa", ["-out", caPrivateKeyPath, "2048"]);
  console.log(`Created: ${caPrivateKeyPath}`);

  console.log("");
  console.log("Generating CA root certificate...");
  await openssl("req", [
    "-x509",
    "-sha256",
    "-days",
    "5",
    "-key",
    caPrivateKeyPath,
    "-out",
    caRootCertPath,
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign",
    "-addext",
    "subjectKeyIdentifier=hash",
    "-subj",
    "/C=UK/ST=London/L=London/O=Test CA Org/OU=IT/CN=test-ca.local",
  ]);
  console.log(`Created: ${caRootCertPath}`);

  return {
    caPrivateKeyPath,
    caRootCertPath,
  };
}

async function prepareCaDirectory(outputDirectoryPath: string) {
  const caDirPath = join(outputDirectoryPath, "certificate-authority");
  if (existsSync(outputDirectoryPath)) {
    console.warn("Existing build-ca directory detected, removing...");
    await rm(outputDirectoryPath, { recursive: true, force: true });
  }

  await mkdir(caDirPath, { recursive: true });
}

function isMainModule() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return process.argv[1] && resolve(process.argv[1]) === currentFilePath;
}

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
