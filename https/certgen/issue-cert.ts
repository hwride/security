import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCaPrivateKeyPath,
  getDefaultBuildCaPath,
  getDefaultBuildIssuedCertPath,
  getIssuedCertCsrPath,
  getIssuedCertExtensionsPath,
  getIssuedCertPath,
  getIssuedCertPrivateKeyPath,
  getRootCaCertPath,
} from "./util/paths.ts";

if (isMainModule()) {
  issueCertificate().catch(handleFatalError);
}

type IssueCertificateOptions = {
  outputDirectoryPath?: string;
  caDirectoryPath?: string;
  dnsNames?: string[];
  ipAddresses?: string[];
  includeSubjectAltName?: boolean;
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
  outputDirectoryPath = getDefaultBuildIssuedCertPath(),
  caDirectoryPath = getDefaultBuildCaPath(),
  dnsNames = ["localhost"],
  ipAddresses = [],
  includeSubjectAltName = true,
  certificateDays = 5,
  verifyCertificateAfterCreation = true,
}: IssueCertificateOptions = {}): Promise<IssueCertificateResult> {
  const caPrivateKeyPath = getCaPrivateKeyPath(caDirectoryPath);
  const caRootCertPath = getRootCaCertPath(caDirectoryPath);

  assertFileExists(
    caPrivateKeyPath,
    `CA private key not found at ${caPrivateKeyPath}. Run generate-ca.ts first.`,
  );
  assertFileExists(
    caRootCertPath,
    `CA root certificate not found at ${caRootCertPath}. Run generate-ca.ts first.`,
  );

  await prepareIssuedCertDirectory(outputDirectoryPath);

  // Generate private key for this certificate.
  const privateKeyPath = await generatePrivateKey(outputDirectoryPath);

  // Prepare a certificate signing request. This is normally given to a certificate authority.
  const certCsrPath = await generateCertificateSigningRequest(
    outputDirectoryPath,
    privateKeyPath,
  );

  // Certificate authority creates a signed certificate from the certificate signing request.
  const certPath = await issueCertificateFromCsr(
    outputDirectoryPath,
    dnsNames,
    ipAddresses,
    includeSubjectAltName,
    certificateDays,
    caRootCertPath,
    caPrivateKeyPath,
    certCsrPath,
  );

  // Check our certificate can be verified from the certificate authority.
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
  const privateKeyPath = getIssuedCertPrivateKeyPath(outputDirectoryPath);
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
  const certCsrPath = getIssuedCertCsrPath(outputDirectoryPath);
  console.log("");
  console.log("Generating certificate signing request...");
  await openssl("req", [
    // The -new option generates a new certificate request.
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
  ipAddresses: string[],
  includeSubjectAltName: boolean,
  certificateDays: number,
  caRootCertPath: string,
  caPrivateKeyPath: string,
  certCsrPath: string,
) {
  const certExtensionsPath = includeSubjectAltName
    ? await writeCertificateExtensionsFile(
        outputDirectoryPath,
        dnsNames,
        ipAddresses,
      )
    : undefined;
  const certPath = getIssuedCertPath(outputDirectoryPath);
  console.log("");
  console.log("CA creating signed certificate from CSR...");
  if (certExtensionsPath) {
    // -extfile is required to assign Subject Alternative Name which Chrome requires to trust an SSL certificate.
    await openssl("x509", [
      // The -req option takes a certificate request and outputs a signed certificate.
      "-req",
      "-in",
      certCsrPath,
      "-CA",
      caRootCertPath,
      "-CAkey",
      caPrivateKeyPath,
      // OpenSSL option to store a bookkeeping file that stores the next serial number used when this CA
      // issues certificates.
      "-CAcreateserial",
      "-out",
      certPath,
      // The certificate is valid for the requested number of days.
      "-days",
      String(certificateDays),
      "-sha256",
      "-extfile",
      certExtensionsPath,
    ]);
  } else {
    await openssl("x509", [
      // The -req option takes a certificate request and outputs a signed certificate.
      "-req",
      "-in",
      certCsrPath,
      "-CA",
      caRootCertPath,
      "-CAkey",
      caPrivateKeyPath,
      // OpenSSL option to store a bookkeeping file that stores the next serial number used when this CA
      // issues certificates.
      "-CAcreateserial",
      "-out",
      certPath,
      // The certificate is valid for the requested number of days.
      "-days",
      String(certificateDays),
      "-sha256",
    ]);
  }
  console.log(`Created: ${certPath}`);

  return certPath;
}

async function writeCertificateExtensionsFile(
  outputDirectoryPath: string,
  dnsNames: string[],
  ipAddresses: string[],
) {
  const certExtensionsPath = getIssuedCertExtensionsPath(outputDirectoryPath);

  const dnsAlternativeNames = dnsNames
    .map((dnsName, index) => `DNS.${index + 1}=${dnsName}`)
    .join("\n");
  const ipAlternativeNames = ipAddresses
    .map((ipAddress, index) => `IP.${index + 1}=${ipAddress}`)
    .join("\n");
  const subjectAlternativeNames = [dnsAlternativeNames, ipAlternativeNames]
    .filter(Boolean)
    .join("\n");

  const extfileContents = [
    // Point back to the CA key that signed this certificate.
    "authorityKeyIdentifier=keyid,issuer",
    // Mark this as a leaf certificate, not a CA.
    "basicConstraints=CA:FALSE",
    // Allow normal TLS leaf-certificate key uses.
    "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment",
    // List the hostname this certificate is valid for.
    "subjectAltName = @alt_names",
    "[alt_names]",
    subjectAlternativeNames,
  ].join("\n");

  await writeFile(certExtensionsPath, extfileContents, "utf-8");
  console.log(`Created: ${certExtensionsPath}`);

  return certExtensionsPath;
}

async function verifyCertificate(caRootCertPath: string, certPath: string) {
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
