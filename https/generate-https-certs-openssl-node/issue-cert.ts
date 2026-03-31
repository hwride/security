import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (isMainModule()) {
  issueCertificate().catch(handleFatalError);
}

type IssueCertificateOptions = {
  outputDirectoryPath?: string;
  caDirectoryPath?: string;
  dnsNames?: string[];
  certificateDays?: number;
  verifyCertificateAfterCreation?: boolean;
};

type IssueCertificateResult = {
  caPrivateKeyPath: string;
  caRootCertPath: string;
  privateKeyPath: string;
  certCsrPath: string;
  certPath: string;
};

/**
 * Issues a TLS certificate from an existing certificate authority (CA):
 * 1) Create a private key.
 * 2) Create a certificate signing request, signed by the private key.
 * 3) Create a certificate from the certificate signing request,
 *    signed by the certificate authority's private key.
 * 4) Verify the certificate chains back to the certificate authority certificate.
 */
export async function issueCertificate({
  outputDirectoryPath = resolve(process.cwd(), "build-issued-cert"),
  caDirectoryPath = resolve(process.cwd(), "build-ca"),
  dnsNames = ["localhost"],
  certificateDays = 5,
  verifyCertificateAfterCreation = true,
}: IssueCertificateOptions = {}): Promise<IssueCertificateResult> {
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

  await prepareIssuedCertDirectory(outputDirectoryPath);

  const privateKeyPath = await generatePrivateKey(outputDirectoryPath);
  const certCsrPath = await generateCertificateSigningRequest(
    outputDirectoryPath,
    privateKeyPath,
  );

  const certPath = await issueCertificateFromCsr(
    outputDirectoryPath,
    dnsNames,
    certificateDays,
    caRootCertPath,
    caPrivateKeyPath,
    certCsrPath,
  );

  if (verifyCertificateAfterCreation) {
    await verifyCertificate(caRootCertPath, certPath);
  }

  return {
    caPrivateKeyPath,
    caRootCertPath,
    privateKeyPath,
    certCsrPath,
    certPath,
  };
}

async function prepareIssuedCertDirectory(outputDirectoryPath: string) {
  if (existsSync(outputDirectoryPath)) {
    console.warn("Existing build-issued-cert directory detected, removing...");
    await rm(outputDirectoryPath, { recursive: true, force: true });
  }

  await mkdir(outputDirectoryPath, { recursive: true });
}

async function generatePrivateKey(outputDirectoryPath: string) {
  const privateKeyPath = resolve(outputDirectoryPath, "private-key.key");
  console.log("");
  console.log("-- Issuing Certificate --");
  console.log("Generating private key...");
  await openssl("genrsa", ["-out", privateKeyPath, "2048"]);
  console.log(`Created: ${privateKeyPath}`);

  return privateKeyPath;
}

async function generateCertificateSigningRequest(
  outputDirectoryPath: string,
  privateKeyPath: string,
) {
  const certCsrPath = resolve(outputDirectoryPath, "cert.csr");
  console.log("");
  console.log("Generating certificate signing request...");
  await openssl("req", [
    "-new",
    "-key",
    privateKeyPath,
    "-out",
    certCsrPath,
    "-subj",
    "/C=UK/ST=London/L=London/O=SSL Test Org/OU=IT/CN=localhost",
  ]);
  console.log(`Created: ${certCsrPath}`);

  return certCsrPath;
}

async function issueCertificateFromCsr(
  outputDirectoryPath: string,
  dnsNames: string[],
  certificateDays: number,
  caRootCertPath: string,
  caPrivateKeyPath: string,
  certCsrPath: string,
) {
  const certExtensionsPath = await writeCertificateExtensionsFile(
    outputDirectoryPath,
    dnsNames,
  );
  const certPath = resolve(outputDirectoryPath, "cert.crt");
  console.log("");
  console.log("CA creating signed certificate from CSR...");
  await openssl("x509", [
    "-req",
    "-in",
    certCsrPath,
    "-CA",
    caRootCertPath,
    "-CAkey",
    caPrivateKeyPath,
    "-CAcreateserial",
    "-out",
    certPath,
    "-days",
    String(certificateDays),
    "-sha256",
    "-extfile",
    certExtensionsPath,
  ]);
  console.log(`Created: ${certPath}`);

  return certPath;
}

async function writeCertificateExtensionsFile(
  outputDirectoryPath: string,
  dnsNames: string[],
) {
  const certExtensionsPath = resolve(outputDirectoryPath, "cert-v3.ext");

  const subjectAlternativeNames = dnsNames
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

  await writeFile(certExtensionsPath, extfileContents, "utf-8");
  console.log(`Created: ${certExtensionsPath}`);

  return certExtensionsPath;
}

async function verifyCertificate(
  caRootCertPath: string,
  certPath: string,
) {
  console.log("");
  console.log("Verifying signed certificate against CA...");
  await openssl("verify", [
    "-x509_strict",
    "-CAfile",
    caRootCertPath,
    certPath,
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
