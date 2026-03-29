import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { join, resolve } from "node:path";

const buildDir = resolve(process.cwd(), "build");
const caDirPath = join(buildDir, "certificate-authority");
const caPrivateKeyPath = join(caDirPath, "ca-private-key.key");
const caRootCertPath = join(caDirPath, "ca-root.crt");
const serverDirPath = join(buildDir, "server");
const serverPrivateKeyPath = join(serverDirPath, "server-private-key.key");
const serverCsrPath = join(serverDirPath, "server.csr");
const serverSignedCertPath = join(serverDirPath, "signed-cert.crt");
const serverCertificateExtensionsPath = resolve(
  process.cwd(),
  "../openssl-https-certs-demo/certificate-authority/v3.ext",
);

async function main() {
  // Cleanup previous runs.
  if (existsSync(buildDir)) {
    console.warn("Existing build directory detected, removing...");
    await rm(buildDir, { recursive: true, force: true });
  }

  // Prepare directories.
  await mkdir(caDirPath, { recursive: true });
  await mkdir(serverDirPath, { recursive: true });

  // Setup Certificate Authority.
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
    // Generate an x509 certificate, used for HTTPS.
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

  console.log("");
  console.log("-- Setting up Server --");
  console.log("Generating server private key...");
  await openssl("genrsa", ["-out", serverPrivateKeyPath, "2048"]);
  console.log(`Created: ${serverPrivateKeyPath}`);

  console.log("");
  console.log("Generating certificate signing request...");
  await openssl("req", [
    // The -new option generates a new certificate request.
    "-new",
    "-key",
    serverPrivateKeyPath,
    "-out",
    serverCsrPath,
    "-subj",
    "/C=UK/ST=London/L=London/O=SSL Test Org/OU=IT/CN=localhost",
  ]);
  console.log(`Created: ${serverCsrPath}`);

  console.log("");
  console.log("CA creating signed certificate from CSR...");
  // openssl x509 - certificate display and signing command
  await openssl("x509", [
    "-req",
    "-in",
    serverCsrPath,
    "-CA",
    caRootCertPath,
    "-CAkey",
    caPrivateKeyPath,
    "-CAcreateserial",
    "-out",
    serverSignedCertPath,
    "-days",
    "500",
    "-sha256",
    "-extfile",
    serverCertificateExtensionsPath,
  ]);
  console.log(`Created: ${serverSignedCertPath}`);
}

main().catch(handleFatalError);

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
