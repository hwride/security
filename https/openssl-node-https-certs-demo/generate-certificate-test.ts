import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { join, resolve } from "node:path";

const buildDir = resolve(process.cwd(), "build");

async function main() {
  // Setup directories.
  await prepareDirectories();

  // Certificate authority setup.
  const caPrivateKeyPath = await generateCaPrivateKey();
  const caRootCertPath = await generateCaRootCertificate(caPrivateKeyPath);

  // Server setup.
  const serverPrivateKeyPath = await generateServerPrivateKey();
  const serverCsrPath = await generateCertificateSigningRequest(serverPrivateKeyPath);

  // Certificate authority creates a signed certificate from the certificate signing request.
  const serverSignedCertPath = await createSignedCertificateFromCsr(
    caRootCertPath,
    caPrivateKeyPath,
    serverCsrPath,
  );

  // Check our certificate can be verified from the certificate authority.
  await verifyServerCertificate(caRootCertPath, serverSignedCertPath);
}

main().catch(handleFatalError);

async function prepareDirectories() {
  const caDirPath = join(buildDir, "certificate-authority");
  const serverDirPath = join(buildDir, "server");
  if (existsSync(buildDir)) {
    console.warn("Existing build directory detected, removing...");
    await rm(buildDir, { recursive: true, force: true });
  }
  await mkdir(caDirPath, { recursive: true });
  await mkdir(serverDirPath, { recursive: true });
}

async function generateCaPrivateKey() {
  const caPrivateKeyPath = join(
    buildDir,
    "certificate-authority",
    "ca-private-key.key",
  );
  console.log("");
  console.log("-- Setting up Certificate Authority (CA) --");
  console.log("Generating CA private key...");
  await openssl("genrsa", ["-out", caPrivateKeyPath, "2048"]);
  console.log(`Created: ${caPrivateKeyPath}`);
  return caPrivateKeyPath;
}

async function generateCaRootCertificate(
  caPrivateKeyPath: string,
) {
  const caRootCertPath = join(buildDir, "certificate-authority", "ca-root.crt");
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

  return caRootCertPath;
}

async function generateServerPrivateKey() {
  const serverPrivateKeyPath = join(buildDir, "server", "server-private-key.key");
  console.log("");
  console.log("-- Setting up Server --");
  console.log("Generating server private key...");
  await openssl("genrsa", ["-out", serverPrivateKeyPath, "2048"]);
  console.log(`Created: ${serverPrivateKeyPath}`);

  return serverPrivateKeyPath;
}

async function generateCertificateSigningRequest(
  serverPrivateKeyPath: string,
) {
  const serverCsrPath = join(buildDir, "server", "server.csr");
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

  return serverCsrPath;
}

async function createSignedCertificateFromCsr(
  caRootCertPath: string,
  caPrivateKeyPath: string,
  serverCsrPath: string,
) {
  const serverCertificateExtensionsPath = resolve(
    process.cwd(),
    "../openssl-https-certs-demo/certificate-authority/v3.ext",
  );
  const serverSignedCertPath = join(buildDir, "server", "signed-cert.crt");
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
    // The certificate is valid for 5 days.
    "-days",
    "5",
    "-sha256",
    "-extfile",
    serverCertificateExtensionsPath,
  ]);
  console.log(`Created: ${serverSignedCertPath}`);

  return serverSignedCertPath;
}

async function verifyServerCertificate(
  caRootCertPath: string,
  serverSignedCertPath: string,
) {
  console.log("");
  console.log("Verifying server certificate against CA certificate...");
  const verifyResult = await openssl("verify", [
    "-x509_strict",
    "-CAfile",
    caRootCertPath,
    serverSignedCertPath,
  ]);
  console.log("Verify result: " + verifyResult.stdout.trim());
}

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
