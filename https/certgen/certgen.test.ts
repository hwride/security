import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import test from "node:test";
import { generateCa } from "./generate-ca.ts";
import { issueCertificate, verifyCertificate } from "./issue-cert.ts";

test("generate-ca output can be used by issue-cert and verified explicitly", async () => {
  try {
    // Generate certificate authority artifacts.
    const { caPrivateKeyPath, caRootCertPath } = await generateCa({
      outputDirectoryPath: "build-test-ca",
    });

    await assertPathMatchesAndFileExists(
      caPrivateKeyPath,
      "build-test-ca/ca-private-key.key",
    );
    await assertPathMatchesAndFileExists(
      caRootCertPath,
      "build-test-ca/ca-root.crt",
    );

    // Issue a certificate signed by the certificate authority.
    const issuedCertificate = await issueCertificate({
      outputDirectoryPath: "build-test-issued-cert",
      caDirectoryPath: "build-test-ca",
      dnsNames: ["localhost"],
      verifyCertificateAfterCreation: false,
    });

    await assertPathMatchesAndFileExists(
      issuedCertificate.privateKeyPath,
      "build-test-issued-cert/private-key.key",
    );
    await assertPathMatchesAndFileExists(
      issuedCertificate.certCsrPath,
      "build-test-issued-cert/cert.csr",
    );
    await assertPathMatchesAndFileExists(
      issuedCertificate.certPath,
      "build-test-issued-cert/cert.crt",
    );
    assert.equal(
      issuedCertificate.caPrivateKeyPath,
      "build-test-ca/ca-private-key.key",
    );
    assert.equal(issuedCertificate.caRootCertPath, "build-test-ca/ca-root.crt");

    await assertFileExistsWithContent("build-test-issued-cert/cert-v3.ext");

    // Verify the issues certificate is signed by the CA.
    const verificationResult = await verifyCertificate(
      "build-test-ca/ca-root.crt",
      issuedCertificate.certPath,
    );
    assert.equal(
      verificationResult.stdout.trim(),
      `${issuedCertificate.certPath}: OK`,
    );
  } finally {
    await rm("build-test-ca", { recursive: true, force: true });
    await rm("build-test-issued-cert", { recursive: true, force: true });
    assert.equal(existsSync("build-test-ca"), false);
    assert.equal(existsSync("build-test-issued-cert"), false);
  }
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
