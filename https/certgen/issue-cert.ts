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
  getIssuedCertPkcs12Path,
  getIssuedCertPrivateKeyPath,
  getRootCaCertPath,
} from "./util/paths.ts";

if (isMainModule()) {
  issueCertificate({ dnsNames: ["localhost"] }).catch(handleFatalError);
}

/** Extended Key Usage (EKU) https://docs.openssl.org/3.0/man5/x509v3_config/#key-usage */
export type EKUVal = "serverAuth" | "clientAuth";

export type IssueCertificateOptions = {
  /** Directory to output the private key, certificate and other build artifacts. */
  outputDirectoryPath?: string;
  /** Directory containing the certificate authority private key, certificate and other build artifacts. */
  caDirectoryPath?: string;
  /** Common Name (CN) to write into the certificate subject. */
  commonName?: string;
  /**
   * DNS names to be written as Subject Alternative Name (SAN) entries.
   * Client will verify that a request matches SAN values.
   */
  dnsNames?: string[];
  /** IP addresses to be written as Subject Alternative Name (SAN) entries. */
  ipAddresses?: string[];
  /** How many days until the certificate expires. */
  certificateDays?: number;
  /** Which Extended Key Usage (EKU) values to write into the leaf certificate. */
  extendedKeyUsage?: EKUVal[];
  /**
   * PKCS#12 (`.p12`) is a bundle format that packages the issued certificate together with its
   * private key and, here, the CA certificate.
   */
  generatePkcs12?: boolean;
};

type IssueCertificateResult = {
  caPrivateKeyPath: string;
  caRootCertPath: string;
  privateKeyPath: string;
  certCsrPath: string;
  certPath: string;
  pkcs12Path?: string;
};

/**
 * Issues a TLS certificate from an existing certificate authority (CA):
 * 1) Create a private key.
 * 2) Create a certificate signing request, signed by the private key.
 * 3) Create a certificate from the certificate signing request,
 *    signed by the certificate authority's private key.
 * 4) Optionally package the certificate, private key and CA certificate as PKCS#12.
 */
export async function issueCertificate({
  outputDirectoryPath = getDefaultBuildIssuedCertPath(),
  caDirectoryPath = getDefaultBuildCaPath(),
  commonName,
  dnsNames = [],
  ipAddresses = [],
  certificateDays = 5,
  extendedKeyUsage = ["serverAuth"],
  generatePkcs12 = true,
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
  // https://cabforum.org/working-groups/server/baseline-requirements/requirements/#7143-subscriber-certificate-common-name-attribute
  const certificateCommonName =
    commonName ?? dnsNames[0] ?? ipAddresses[0] ?? "common-name-default";

  // Prepare a certificate signing request. This is normally given to a certificate authority.
  const certCsrPath = await generateCertificateSigningRequest(
    outputDirectoryPath,
    privateKeyPath,
    certificateCommonName,
  );

  // Certificate authority creates a signed certificate from the certificate signing request.
  const certPath = await issueCertificateFromCsr(
    outputDirectoryPath,
    dnsNames,
    ipAddresses,
    certificateDays,
    extendedKeyUsage,
    caRootCertPath,
    caPrivateKeyPath,
    certCsrPath,
  );

  const pkcs12Path = generatePkcs12
    ? await generatePkcs12Bundle(
        outputDirectoryPath,
        privateKeyPath,
        certPath,
        caRootCertPath,
      )
    : undefined;

  logIssuedCertificateViewCommands(caRootCertPath, certPath, pkcs12Path);

  return {
    caPrivateKeyPath,
    caRootCertPath,
    privateKeyPath,
    certCsrPath,
    certPath,
    pkcs12Path,
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
  commonName: string,
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
    `/C=UK/ST=London/L=London/O=SSL Test Org/OU=IT/CN=${commonName}`,
  ]);
  console.log(`Created: ${certCsrPath}`);

  return certCsrPath;
}

async function issueCertificateFromCsr(
  outputDirectoryPath: string,
  dnsNames: string[],
  ipAddresses: string[],
  certificateDays: number,
  extendedKeyUsage: EKUVal[],
  caRootCertPath: string,
  caPrivateKeyPath: string,
  certCsrPath: string,
) {
  const certExtensionsPath = await writeCertificateExtensionsFile(
    outputDirectoryPath,
    dnsNames,
    ipAddresses,
    extendedKeyUsage,
  );
  const certPath = getIssuedCertPath(outputDirectoryPath);
  console.log("");
  console.log("CA creating signed certificate from CSR...");
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
  console.log(`Created: ${certPath}`);

  return certPath;
}

async function writeCertificateExtensionsFile(
  outputDirectoryPath: string,
  dnsNames: string[],
  ipAddresses: string[],
  extendedKeyUsage: EKUVal[],
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
  const hasSubjectAlternativeNames = subjectAlternativeNames.length > 0;

  const extfileLines = [
    // Point back to the CA key that signed this certificate.
    "authorityKeyIdentifier=keyid,issuer",
    // Mark this as a leaf certificate, not a CA.
    "basicConstraints=CA:FALSE",
    // Allow normal TLS leaf-certificate key uses.
    "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment",
  ];

  if (extendedKeyUsage.length > 0) {
    extfileLines.push(`extendedKeyUsage = ${extendedKeyUsage.join(", ")}`);
  }

  if (hasSubjectAlternativeNames) {
    extfileLines.push(
      // List the hostnames and IPs this certificate is valid for.
      "subjectAltName = @alt_names",
      "[alt_names]",
      subjectAlternativeNames,
    );
  }

  const extfileContents = extfileLines.join("\n");

  await writeFile(certExtensionsPath, extfileContents, "utf-8");
  console.log(`Created: ${certExtensionsPath}`);

  return certExtensionsPath;
}

async function generatePkcs12Bundle(
  outputDirectoryPath: string,
  privateKeyPath: string,
  certPath: string,
  caRootCertPath: string,
) {
  const pkcs12Path = getIssuedCertPkcs12Path(outputDirectoryPath);
  console.log("");
  console.log(
    "Packaging PKCS#12 bundle containing issued cert, private key, and also CA cert ...",
  );
  await openssl("pkcs12", [
    // Write a PKCS#12 bundle instead of reading one.
    "-export",
    // Output path for the generated .p12 file.
    "-out",
    pkcs12Path,
    // The certificate to package into the bundle.
    "-in",
    certPath,
    // The private key that matches the bundled certificate.
    "-inkey",
    privateKeyPath,
    // Include an additional certificate in the bundle, such as a CA or intermediate certificate.
    "-certfile",
    caRootCertPath,
    // Use an empty export password for local development/testing convenience.
    "-passout",
    "pass:",
  ]);
  console.log(`Created: ${pkcs12Path}`);

  return pkcs12Path;
}

/**
 * Log a few openssl CLI commands for inspecting the certificates.
 */
function logIssuedCertificateViewCommands(
  caRootCertPath: string,
  certPath: string,
  pkcs12Path: string | undefined,
) {
  console.log("");
  console.log(
    `View contents of CA certificate: openssl x509 -in ${caRootCertPath} -text -noout`,
  );
  console.log(
    `Verify issued certificate against CA certificate: openssl verify -x509_strict -CAfile ${caRootCertPath} ${certPath}`,
  );
  console.log(
    `View contents of issued certificate: openssl x509 -in ${certPath} -text -noout`,
  );

  if (pkcs12Path) {
    console.log(
      `View overview of PKCS#12 bundle: openssl pkcs12 -in ${pkcs12Path} -info -noout`,
    );
    console.log(
      `View contents of CA certificate, via PKCS#12 bundle: openssl pkcs12 -in ${pkcs12Path} -cacerts -nokeys | openssl x509 -text -noout`,
    );
    console.log(
      `View contents of issued certificate, via PKCS#12 bundle: openssl pkcs12 -in ${pkcs12Path} -clcerts -nokeys | openssl x509 -text -noout`,
    );
    console.log("Password is currently empty, just hit enter when prompted.");
  }
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
