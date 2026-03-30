import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  generateCertificateTest().catch(handleFatalError);
}

type GenerateCertificateTestOptions = {
  outputDirectoryPath?: string;
  serverDnsNames?: string[];
};

type GenerateCertificateTestResult = {
  caPrivateKeyPath: string;
  caRootCertPath: string;
  serverPrivateKeyPath: string;
  serverCsrPath: string;
  serverSignedCertPath: string;
};

/**
 * Some test code calling the openssl CLI tool to simulate the entire flow for
 * generating a valid HTTPS certificate:
 * 1) Create a certificate authority private key.
 * 2) Create a certificate authority root certificate, signed by the CA's private key.
 * 3) Create a server private key.
 * 4) Create a server certificate signing request, signed by the server's private key.
 * 5) Create a certificate for the server from the certificate signing request,
 *    signed by the certificate authority's private key.
 * 6) Verify the server certificate chains back to the certificate authority certificate,
 *    which includes checking the signature on the server certificate using the CA public key.
 *    TLS clients will also check that the certificate's hostname matches the hostname they requested.
 */
export async function generateCertificateTest({
  outputDirectoryPath = resolve(process.cwd(), "build"),
  serverDnsNames = ["localhost"],
}: GenerateCertificateTestOptions = {}): Promise<GenerateCertificateTestResult> {
  // Setup directories.
  await prepareDirectories(outputDirectoryPath);

  // Certificate authority setup.
  const caPrivateKeyPath = await generateCaPrivateKey(outputDirectoryPath);
  const caRootCertPath = await generateCaRootCertificate(
    outputDirectoryPath,
    caPrivateKeyPath,
  );

  // Server setup.
  const serverPrivateKeyPath =
    await generateServerPrivateKey(outputDirectoryPath);
  const serverCsrPath = await generateCertificateSigningRequest(
    outputDirectoryPath,
    serverPrivateKeyPath,
  );

  // Certificate authority creates a signed certificate from the certificate signing request.
  const serverSignedCertPath = await createSignedCertificateFromCsr(
    outputDirectoryPath,
    serverDnsNames,
    caRootCertPath,
    caPrivateKeyPath,
    serverCsrPath,
  );

  // Check our certificate can be verified from the certificate authority.
  await verifyServerCertificate(caRootCertPath, serverSignedCertPath);

  return {
    caPrivateKeyPath,
    caRootCertPath,
    serverPrivateKeyPath,
    serverCsrPath,
    serverSignedCertPath,
  };
}

async function prepareDirectories(outputDirectoryPath: string) {
  const caDirPath = join(outputDirectoryPath, "certificate-authority");
  const serverDirPath = join(outputDirectoryPath, "server");
  if (existsSync(outputDirectoryPath)) {
    console.warn("Existing build directory detected, removing...");
    await rm(outputDirectoryPath, { recursive: true, force: true });
  }
  await mkdir(caDirPath, { recursive: true });
  await mkdir(serverDirPath, { recursive: true });
}

async function generateCaPrivateKey(outputDirectoryPath: string) {
  const caPrivateKeyPath = join(
    outputDirectoryPath,
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
  outputDirectoryPath: string,
  caPrivateKeyPath: string,
) {
  const caRootCertPath = join(
    outputDirectoryPath,
    "certificate-authority",
    "ca-root.crt",
  );
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

async function generateServerPrivateKey(outputDirectoryPath: string) {
  const serverPrivateKeyPath = join(
    outputDirectoryPath,
    "server",
    "server-private-key.key",
  );
  console.log("");
  console.log("-- Setting up Server --");
  console.log("Generating server private key...");
  await openssl("genrsa", ["-out", serverPrivateKeyPath, "2048"]);
  console.log(`Created: ${serverPrivateKeyPath}`);

  return serverPrivateKeyPath;
}

async function generateCertificateSigningRequest(
  outputDirectoryPath: string,
  serverPrivateKeyPath: string,
) {
  const serverCsrPath = join(outputDirectoryPath, "server", "server.csr");
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
  outputDirectoryPath: string,
  serverDnsNames: string[],
  caRootCertPath: string,
  caPrivateKeyPath: string,
  serverCsrPath: string,
) {
  const serverCertificateExtensionsPath =
    await writeServerCertificateExtensionsFile(
    outputDirectoryPath,
    serverDnsNames,
  );
  const serverSignedCertPath = join(
    outputDirectoryPath,
    "server",
    "signed-cert.crt",
  );
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
    // -extfile is required to assign Subject Alternative Name which Chrome requires to trust an SSL certificate.
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

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

async function writeServerCertificateExtensionsFile(
  outputDirectoryPath: string,
  serverDnsNames: string[],
) {
  const serverCertificateExtensionsPath = join(
    outputDirectoryPath,
    "server",
    "v3.ext",
  );
  const altNames = serverDnsNames
    .map((serverDnsName, index) => `DNS.${index + 1} = ${serverDnsName}`)
    .join("\n");

  await writeFile(
    serverCertificateExtensionsPath,
    `# Point back to the CA key that signed this certificate.
authorityKeyIdentifier=keyid,issuer
# Mark this as a leaf certificate, not a CA.
basicConstraints=CA:FALSE
# Allow normal TLS leaf-certificate key uses.
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
# List the hostname this certificate is valid for.
subjectAltName = @alt_names

[alt_names]
${altNames}
`,
  );

  return serverCertificateExtensionsPath;
}
