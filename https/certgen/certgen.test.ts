import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { generateCa } from "./generate-ca.ts";
import { openssl } from "../openssl-node/openssl-node.ts";

import { issueCertificate, verifyCertificate } from "./issue-cert.ts";

const buildTestDirectoryPath = "build-test";
afterEach(async () => {
  await rm(buildTestDirectoryPath, { recursive: true, force: true });
});

test("generate-ca output can be used by issue-cert and verified explicitly", async () => {
  const caDirectoryPath = join(buildTestDirectoryPath, "ca");
  const issuedCertificateDirectoryPath = join(buildTestDirectoryPath, "issued");

  // Generate certificate authority artifacts.
  const { caPrivateKeyPath, caRootCertPath } = await generateCa({
    outputDirectoryPath: caDirectoryPath,
  });

  await assertPathMatchesAndFileExists(
    caPrivateKeyPath,
    join(caDirectoryPath, "ca-private-key.key"),
  );
  await assertPathMatchesAndFileExists(
    caRootCertPath,
    join(caDirectoryPath, "ca-root.crt"),
  );

  // Issue a certificate signed by the certificate authority.
  const issuedCertificate = await issueCertificate({
    outputDirectoryPath: issuedCertificateDirectoryPath,
    caDirectoryPath,
    dnsNames: ["localhost"],
    generatePkcs12: true,
    verifyCertificateAfterCreation: false,
  });

  await assertPathMatchesAndFileExists(
    issuedCertificate.privateKeyPath,
    join(issuedCertificateDirectoryPath, "private-key.key"),
  );
  await assertPathMatchesAndFileExists(
    issuedCertificate.certCsrPath,
    join(issuedCertificateDirectoryPath, "cert.csr"),
  );
  await assertPathMatchesAndFileExists(
    issuedCertificate.certPath,
    join(issuedCertificateDirectoryPath, "cert.crt"),
  );
  await assertPathMatchesAndFileExists(
    issuedCertificate.pkcs12Path,
    join(issuedCertificateDirectoryPath, "cert.p12"),
  );
  assert.equal(
    issuedCertificate.caPrivateKeyPath,
    join(caDirectoryPath, "ca-private-key.key"),
  );
  assert.equal(
    issuedCertificate.caRootCertPath,
    join(caDirectoryPath, "ca-root.crt"),
  );

  await assertFileExistsWithContent(
    join(issuedCertificateDirectoryPath, "cert-v3.ext"),
  );
  await assertPkcs12BundleIsReadable(issuedCertificate.pkcs12Path);

  // Verify the issues certificate is signed by the CA.
  const verificationResult = await verifyCertificate(
    join(caDirectoryPath, "ca-root.crt"),
    issuedCertificate.certPath,
  );
  assert.equal(
    verificationResult.stdout.trim(),
    `${issuedCertificate.certPath}: OK`,
  );
});

test("issue-cert writes the requested extended key usages", async () => {
  const caDirectoryPath = join(buildTestDirectoryPath, "ca");
  const serverCertificateDirectoryPath = join(
    buildTestDirectoryPath,
    "issued-server",
  );
  const clientCertificateDirectoryPath = join(
    buildTestDirectoryPath,
    "issued-client",
  );
  const bothCertificateDirectoryPath = join(
    buildTestDirectoryPath,
    "issued-both",
  );

  await generateCa({ outputDirectoryPath: caDirectoryPath });

  // Check server only.
  const serverCertificate = await issueCertificate({
    outputDirectoryPath: serverCertificateDirectoryPath,
    caDirectoryPath,
    dnsNames: ["localhost"],
    extendedKeyUsage: ["serverAuth"],
  });
  const serverPurposes = await getCertificatePurposes(
    serverCertificate.certPath,
  );
  assert.match(serverPurposes, /SSL server : Yes/);
  assert.match(serverPurposes, /SSL client : No/);

  // Check client only.
  const clientCertificate = await issueCertificate({
    outputDirectoryPath: clientCertificateDirectoryPath,
    caDirectoryPath,
    commonName: "mtls-client.local",
    extendedKeyUsage: ["clientAuth"],
  });
  const clientPurposes = await getCertificatePurposes(
    clientCertificate.certPath,
  );
  assert.match(clientPurposes, /SSL client : Yes/);
  assert.match(clientPurposes, /SSL server : No/);

  // Check server and client.
  const bothCertificate = await issueCertificate({
    outputDirectoryPath: bothCertificateDirectoryPath,
    caDirectoryPath,
    commonName: "mtls-client.local",
    extendedKeyUsage: ["serverAuth", "clientAuth"],
  });
  const bothPurposes = await getCertificatePurposes(bothCertificate.certPath);
  assert.match(bothPurposes, /SSL client : Yes/);
  assert.match(bothPurposes, /SSL server : Yes/);
});

async function assertPathMatchesAndFileExists(
  actualPath: string,
  expectedPath: string,
) {
  assert.equal(actualPath, expectedPath);
  await assertFileExistsWithContent(actualPath);
}

async function assertFileExistsWithContent(filePath: string) {
  const fileStats = await stat(filePath);
  assert.equal(fileStats.isFile(), true);
  assert.ok(fileStats.size > 0);
}

async function getCertificatePurposes(certPath: string) {
  const result = await openssl("x509", ["-in", certPath, "-noout", "-purpose"]);

  return result.stdout;
}

async function assertPkcs12BundleIsReadable(pkcs12Path: string | undefined) {
  assert.ok(pkcs12Path);
  await openssl("pkcs12", [
    "-in",
    pkcs12Path,
    "-info",
    "-noout",
    "-passin",
    "pass:",
  ]);
}
