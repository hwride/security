import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { join, resolve } from "node:path";

const buildDir = resolve(process.cwd(), "build");
const caDirPath = join(buildDir, "certificate-authority");
const caPrivateKeyPath = join(caDirPath, "ca-private-key.key");
const caRootCertPath = join(caDirPath, "ca-root.crt");

async function main() {
  // Cleanup previous runs.
  if (existsSync(buildDir)) {
    console.warn("Existing build directory detected, removing...");
    await rm(buildDir, { recursive: true, force: true });
  }

  // Prepare directories.
  await mkdir(caDirPath, { recursive: true });

  // Setup Certificate Authority.
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
    "-nodes",
    // The certificate is valid for 5 days.
    "-days",
    "5",
    "-key",
    caPrivateKeyPath,
    "-out",
    caRootCertPath,
    // basicConstraints: mark this certificate as a CA certificate.
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    // keyUsage: allow this key to sign certificates.
    "keyUsage=critical,keyCertSign",
    "-addext",
    // subjectKeyIdentifier: give the CA key a stable identifier for chain building.
    "subjectKeyIdentifier=hash",
    "-subj",
    "/C=UK/ST=London/L=London/O=Test CA Org/OU=IT/CN=test-ca.local",
  ]);
  console.log(`Created: ${caRootCertPath}`);
}

main().catch(handleFatalError);

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
