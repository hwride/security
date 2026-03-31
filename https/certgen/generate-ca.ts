import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { openssl } from "../openssl-node/openssl-node.ts";
import { fileURLToPath } from "node:url";
import {
  getCaPrivateKeyPath,
  getDefaultBuildCaPath,
  getRootCaCertPath,
} from "./util/paths.ts";

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
  outputDirectoryPath = getDefaultBuildCaPath(),
}: GenerateCaOptions = {}): Promise<GenerateCaResult> {
  await prepareCaDirectory(outputDirectoryPath);

  const caPrivateKeyPath = getCaPrivateKeyPath(outputDirectoryPath);
  const caRootCertPath = getRootCaCertPath(outputDirectoryPath);

  console.log("");
  console.log("-- Setting up Certificate Authority (CA) --");
  console.log("Generating CA private key...");
  await openssl("genrsa", ["-out", caPrivateKeyPath, "2048"]);
  console.log(`Created: ${caPrivateKeyPath}`);

  console.log("");
  console.log("Generating CA root certificate...");
  // openssl req = create and process certificate signing requests (CSRs),
  //               and generate self-signed certificates.
  await openssl("req", [
    // Instead of writing a CSR for a later signing step, create a self-signed X.509 certificate directly.
    // This means this certificate will be signed with the private key we provide, rather than by a separate
    // private key owned by a separate certificate authority.
    "-x509",
    "-sha256",
    // The certificate is valid for 5 days.
    "-days",
    "5",
    // Path to our private key, used to sign the certificate.
    "-key",
    caPrivateKeyPath,
    // Path to write our generate certificate to.
    "-out",
    caRootCertPath,
    // basicConstraints: mark this certificate as a CA certificate.
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    // keyUsage: allow this key to sign certificates.
    "-addext",
    "keyUsage=critical,keyCertSign",
    // subjectKeyIdentifier: give the CA key a stable identifier for chain building.
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
  if (existsSync(outputDirectoryPath)) {
    console.warn("Existing build-ca directory detected, removing...");
    await rm(outputDirectoryPath, { recursive: true, force: true });
  }

  await mkdir(outputDirectoryPath, { recursive: true });
}

function isMainModule() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return process.argv[1] && resolve(process.argv[1]) === currentFilePath;
}

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
