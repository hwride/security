import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  generateHttpsCertificates().catch(handleFatalError);
}

type GenerateHttpsCertificatesOptions = {
  outputDirectoryPath?: string;
  caDirectoryPath?: string;
  serverDnsNames?: string[];
  serverCertificateDays?: number;
  verifyServerCertificateAfterCreation?: boolean;
};

type GenerateHttpsCertificatesResult = {
  caPrivateKeyPath: string;
  caRootCertPath: string;
  serverPrivateKeyPath: string;
  serverCsrPath: string;
  serverSignedCertPath: string;
};

/**
 * Generates the server TLS assets from an existing certificate authority (CA):
 * 1) Create a server private key.
 * 2) Create a server certificate signing request, signed by the server's private key.
 * 3) Create a certificate for the server from the certificate signing request,
 *    signed by the certificate authority's private key.
 * 4) Verify the server certificate chains back to the certificate authority certificate.
 */
export async function generateHttpsCertificates({
  outputDirectoryPath = resolve(process.cwd(), "build-server"),
  caDirectoryPath = resolve(process.cwd(), "build-ca"),
  serverDnsNames = ["localhost"],
  serverCertificateDays = 5,
  verifyServerCertificateAfterCreation = true,
}: GenerateHttpsCertificatesOptions = {}): Promise<GenerateHttpsCertificatesResult> {
  const caPrivateKeyPath = resolve(caDirectoryPath, "ca-private-key.key");
  const caRootCertPath = resolve(caDirectoryPath, "ca-root.crt");

  assertFileExists(
    caPrivateKeyPath,
    `CA private key not found at ${caPrivateKeyPath}. Run generate-ca.ts first.`,
  );
  assertFileExists(
    caRootCertPath,
    `CA root certificate not found at ${caRootCertPath}. Run generate-ca.ts first.`,
  );

  await prepareServerDirectory(outputDirectoryPath);

  const serverPrivateKeyPath =
    await generateServerPrivateKey(outputDirectoryPath);
  const serverCsrPath = await generateCertificateSigningRequest(
    outputDirectoryPath,
    serverPrivateKeyPath,
  );

  const serverSignedCertPath = await createSignedCertificateFromCsr(
    outputDirectoryPath,
    serverDnsNames,
    serverCertificateDays,
    caRootCertPath,
    caPrivateKeyPath,
    serverCsrPath,
  );

  if (verifyServerCertificateAfterCreation) {
    await verifyServerCertificate(caRootCertPath, serverSignedCertPath);
  }

  return {
    caPrivateKeyPath,
    caRootCertPath,
    serverPrivateKeyPath,
    serverCsrPath,
    serverSignedCertPath,
  };
}

async function prepareServerDirectory(outputDirectoryPath: string) {
  if (existsSync(outputDirectoryPath)) {
    console.warn("Existing build-server directory detected, removing...");
    await rm(outputDirectoryPath, { recursive: true, force: true });
  }

  await mkdir(outputDirectoryPath, { recursive: true });
}

async function generateServerPrivateKey(outputDirectoryPath: string) {
  const serverPrivateKeyPath = resolve(
    outputDirectoryPath,
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
  const serverCsrPath = resolve(outputDirectoryPath, "server.csr");
  console.log("");
  console.log("Generating certificate signing request...");
  await openssl("req", [
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
  serverCertificateDays: number,
  caRootCertPath: string,
  caPrivateKeyPath: string,
  serverCsrPath: string,
) {
  const serverCertificateExtensionsPath =
    await writeServerCertificateExtensionsFile(
      outputDirectoryPath,
      serverDnsNames,
    );
  const serverSignedCertPath = resolve(outputDirectoryPath, "signed-cert.crt");
  console.log("");
  console.log("CA creating signed certificate from CSR...");
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
    String(serverCertificateDays),
    "-sha256",
    "-extfile",
    serverCertificateExtensionsPath,
  ]);
  console.log(`Created: ${serverSignedCertPath}`);

  return serverSignedCertPath;
}

async function writeServerCertificateExtensionsFile(
  outputDirectoryPath: string,
  serverDnsNames: string[],
) {
  const serverCertificateExtensionsPath = resolve(
    outputDirectoryPath,
    "server-v3.ext",
  );

  const subjectAlternativeNames = serverDnsNames
    .map((dnsName, index) => `DNS.${index + 1}=${dnsName}`)
    .join("\n");

  const extfileContents = [
    "authorityKeyIdentifier=keyid,issuer",
    "basicConstraints=CA:FALSE",
    "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment",
    "subjectAltName = @alt_names",
    "[alt_names]",
    subjectAlternativeNames,
  ].join("\n");

  await writeFile(serverCertificateExtensionsPath, extfileContents, "utf-8");
  console.log(`Created: ${serverCertificateExtensionsPath}`);

  return serverCertificateExtensionsPath;
}

async function verifyServerCertificate(
  caRootCertPath: string,
  serverSignedCertPath: string,
) {
  console.log("");
  console.log("Verifying signed certificate against CA...");
  await openssl("verify", [
    "-x509_strict",
    "-CAfile",
    caRootCertPath,
    serverSignedCertPath,
  ]);
  console.log("Verification successful.");
}

function assertFileExists(filePath: string, errorMessage: string) {
  if (existsSync(filePath)) {
    return;
  }

  throw new Error(errorMessage);
}

function isMainModule() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return process.argv[1] && resolve(process.argv[1]) === currentFilePath;
}

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
