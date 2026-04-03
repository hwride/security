import { existsSync, readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateCa } from "../certgen/generate-ca.ts";
import { issueCertificate } from "../certgen/issue-cert.ts";
import { getIssuedCertExtensionsPath } from "../certgen/util/paths.ts";

const serverPort = 8080;
let server: https.Server | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server!.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  server = undefined;
});

test("successful request when certificate has a DNS SAN", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({ dnsNames: ["localhost"] });

  await bootHttpsServer(certPath, privateKeyPath);

  const responseBody = await makeHttpsRequest({
    requestOptions: { ca: readFileSync(caRootCertPath) },
  });
  expect(responseBody).toBe("HTTPS response");
});

test("successful request when certificate has an IP SAN", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: [],
      ipAddresses: ["127.0.0.1"],
    });

  await bootHttpsServer(certPath, privateKeyPath);

  const responseBody = await makeHttpsRequest({
    requestUrl: `https://127.0.0.1:${serverPort}`,
    requestOptions: { ca: readFileSync(caRootCertPath) },
  });
  expect(responseBody).toBe("HTTPS response");
});

test("failed request due to certificate with no SANs", async () => {
  expect.hasAssertions();

  const issuedCertDirectoryPath = resolve(process.cwd(), "build-issued-cert");
  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({ dnsNames: [], ipAddresses: [] });
  expect(existsSync(getIssuedCertExtensionsPath(issuedCertDirectoryPath))).toBe(
    true,
  );

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(
    makeHttpsRequest({
      requestUrl: `https://127.0.0.1:${serverPort}`,
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).rejects.toMatchObject({
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    message: expect.stringContaining("does not match certificate's altnames"),
  });
});

// As this test shows, when a certificate has no SAN entries, Node can fall back to
// validating the request hostname against the certificate Common Name (CN).
// SAN is still the modern, recommended place for certificate identities, and
// publicly trusted TLS certificates are generally expected to include SANs.
// https://cabforum.org/working-groups/server/baseline-requirements/requirements/#7143-subscriber-certificate-common-name-attribute
test("successful request when certificate has no SANs but CN matches request domain", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      commonName: "localhost",
      dnsNames: [],
      ipAddresses: [],
    });

  await bootHttpsServer(certPath, privateKeyPath);

  const responseBody = await makeHttpsRequest({
    requestOptions: { ca: readFileSync(caRootCertPath) },
  });
  expect(responseBody).toBe("HTTPS response");
});

test("failed request when certificate has DNS SAN that does not match request domain", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({ dnsNames: ["example.test"] });

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(
    makeHttpsRequest({
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).rejects.toMatchObject({
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    message: expect.stringContaining("does not match certificate's altnames"),
  });
});

test("failed request when certificate has DNS SAN but request uses an IP", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({ dnsNames: ["localhost"] });

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(
    makeHttpsRequest({
      requestUrl: `https://127.0.0.1:${serverPort}`,
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).rejects.toMatchObject({
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    message: expect.stringContaining("does not match certificate's altnames"),
  });
});

test("failed request when certificate has IP SAN but request uses a domain", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      commonName: "unused.invalid",
      ipAddresses: ["127.0.0.1"],
    });

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(
    makeHttpsRequest({
      requestUrl: `https://localhost:${serverPort}`,
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).rejects.toMatchObject({
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    message: expect.stringContaining("does not match certificate's altnames"),
  });
});

test("successful requests matching multiple SANs - DNS and IP", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: ["localhost"],
      ipAddresses: ["127.0.0.1"],
    });

  await bootHttpsServer(certPath, privateKeyPath);

  // Domain request should work.
  expect(
    await makeHttpsRequest({
      requestUrl: `https://localhost:${serverPort}`,
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).toBe("HTTPS response");

  // IP request should work.
  expect(
    await makeHttpsRequest({
      requestUrl: `https://127.0.0.1:${serverPort}`,
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).toBe("HTTPS response");
});

test("server certificate is not signed by a trusted root certificate", async () => {
  expect.hasAssertions();

  const { privateKeyPath, certPath } = await generateCertificates({
    dnsNames: ["localhost"],
  });

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(makeHttpsRequest()).rejects.toMatchObject({
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    message: expect.stringContaining("unable to verify the first certificate"),
  });
});

test("failed request due to expired certificate", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: ["localhost"],
      certificateDays: 0,
    });

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(
    makeHttpsRequest({
      requestOptions: { ca: readFileSync(caRootCertPath) },
    }),
  ).rejects.toMatchObject({
    code: "CERT_HAS_EXPIRED",
    message: expect.stringContaining("certificate has expired"),
  });
});

async function generateCertificates(
  options: Parameters<typeof issueCertificate>[0] = {},
) {
  const caDirectoryPath = resolve(process.cwd(), "build-ca");
  const issuedCertDirectoryPath = resolve(process.cwd(), "build-issued-cert");

  await generateCa({ outputDirectoryPath: caDirectoryPath });
  return issueCertificate({
    outputDirectoryPath: issuedCertDirectoryPath,
    caDirectoryPath,
    ...options,
  });
}

async function bootHttpsServer(certPath: string, privateKeyPath: string) {
  server = https.createServer(
    {
      cert: readFileSync(certPath),
      key: readFileSync(privateKeyPath),
    },
    function handleRequest(_request, response) {
      response.writeHead(200);
      response.end("HTTPS response");
    },
  );

  await new Promise<void>((resolve) => {
    server!.listen(serverPort, resolve);
  });
}

function makeHttpsRequest({
  requestUrl = `https://localhost:${serverPort}`,
  requestOptions = {},
}: {
  requestUrl?: string;
  requestOptions?: https.RequestOptions;
} = {}) {
  return new Promise<string>((resolve, reject) => {
    const request = https.get(requestUrl, requestOptions, (response) => {
      let data = "";

      response.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });

      response.on("end", () => {
        resolve(data);
      });
    });

    request.on("error", reject);
  });
}
