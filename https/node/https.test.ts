import { readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateCa } from "../certgen/generate-ca.ts";
import { issueCertificate } from "../certgen/issue-cert.ts";

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

test("successful request", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates();

  await bootHttpsServer(certPath, privateKeyPath);

  const responseBody = await makeHttpsRequest({
    requestOptions: { ca: readFileSync(caRootCertPath) },
  });
  expect(responseBody).toBe("HTTPS response");
});

test("server certificate is not signed by a trusted root certificate", async () => {
  expect.hasAssertions();

  const { privateKeyPath, certPath } = await generateCertificates();

  await bootHttpsServer(certPath, privateKeyPath);

  await expect(makeHttpsRequest({})).rejects.toMatchObject({
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    message: expect.stringContaining("unable to verify the first certificate"),
  });
});

test("server certificate is signed correctly, but hostname does not match the requested hostname", async () => {
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

test("server certificate is signed correctly, but certificate has expired", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      certificateDays: 0,
      verifyCertificateAfterCreation: false,
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

test("server certificate is signed correctly for localhost, but request uses an IP address", async () => {
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

test("request to an IP fails when the certificate does not contain a SAN extension", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({ includeSubjectAltName: false });

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
}) {
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
