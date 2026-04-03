import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import * as https from "node:https";
import { join, resolve } from "node:path";
import * as tls from "node:tls";
import { TlsOptions } from "node:tls";
import { afterEach, expect, test } from "vitest";
import { generateCa } from "../certgen/generate-ca.ts";
import { issueCertificate } from "../certgen/issue-cert.ts";

const serverPort = 9443;
const buildTestDirectoryPath = resolve(process.cwd(), "build-test");
let server: https.Server | undefined;

afterEach(async () => {
  if (server) {
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
  }

  await rm(buildTestDirectoryPath, { recursive: true, force: true });
});

test("successful mTLS request when client provides trusted certificate", async () => {
  expect.hasAssertions();

  const {
    caRootCertPath,
    serverPrivateKeyPath,
    serverCertPath,
    clientPrivateKeyPath,
    clientCertPath,
  } = await generateMtlsCertificates();

  await bootHttpsServer({
    // The CA cert we use to verify the client's certificate.
    ca: readFileSync(caRootCertPath),
    // Servers's certificate and private key.
    cert: readFileSync(serverCertPath),
    key: readFileSync(serverPrivateKeyPath),
  });

  const responseBody = await makeHttpsRequest({
    // The CA cert we use to verify the server's certificate.
    ca: readFileSync(caRootCertPath),
    // Client's certificate and private key.
    cert: readFileSync(clientCertPath),
    key: readFileSync(clientPrivateKeyPath),
  });

  expect(responseBody).toBe("mTLS response");
});

test("failed mTLS request when client does not provide certificate", async () => {
  expect.hasAssertions();

  const { caRootCertPath, serverPrivateKeyPath, serverCertPath } =
    await generateMtlsCertificates();

  await bootHttpsServer({
    // The CA cert we use to verify the client's certificate.
    ca: readFileSync(caRootCertPath),
    // Servers's certificate and private key.
    cert: readFileSync(serverCertPath),
    key: readFileSync(serverPrivateKeyPath),
  });

  await expect(
    makeHttpsRequest({
      // The CA cert we use to verify the server's certificate.
      ca: readFileSync(caRootCertPath),
    }),
  ).rejects.toMatchObject({
    code: "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED",
    message: expect.stringContaining("tlsv13 alert certificate required"),
  });
});

async function generateMtlsCertificates() {
  const caDirectoryPath = join(buildTestDirectoryPath, "ca");
  const serverCertificateDirectoryPath = join(
    buildTestDirectoryPath,
    "server-cert",
  );
  const clientCertificateDirectoryPath = join(
    buildTestDirectoryPath,
    "client-cert",
  );

  const { caRootCertPath } = await generateCa({
    outputDirectoryPath: caDirectoryPath,
  });

  const { privateKeyPath: serverPrivateKeyPath, certPath: serverCertPath } =
    await issueCertificate({
      outputDirectoryPath: serverCertificateDirectoryPath,
      caDirectoryPath,
      dnsNames: ["localhost"],
      extendedKeyUsage: ["serverAuth"],
    });

  const { privateKeyPath: clientPrivateKeyPath, certPath: clientCertPath } =
    await issueCertificate({
      outputDirectoryPath: clientCertificateDirectoryPath,
      caDirectoryPath,
      commonName: "mtls-client.local",
      dnsNames: ["mtls-client.local"],
      extendedKeyUsage: ["clientAuth"],
    });

  return {
    caRootCertPath,
    serverPrivateKeyPath,
    serverCertPath,
    clientPrivateKeyPath,
    clientCertPath,
  };
}

async function bootHttpsServer(opts: TlsOptions) {
  server = https.createServer(
    {
      ...opts,
      requestCert: true,
      rejectUnauthorized: true,
    },
    function handleRequest(request, response) {
      const socket = request.socket;

      // Mainly doing this check for the type narrowing.
      if (!(socket instanceof tls.TLSSocket)) {
        throw new Error("Un-expected non TLS socket");
      }

      if (!socket.authorized) {
        response.writeHead(401);
        response.end("Client certificate required");
        return;
      }

      response.writeHead(200);
      response.end("mTLS response");
    },
  );

  await new Promise<void>((resolve) => {
    server!.listen(serverPort, resolve);
  });
}

function makeHttpsRequest(opts: https.RequestOptions) {
  if (!opts.hostname) {
    opts.hostname = "localhost";
  }
  if (!opts.port) {
    opts.port = serverPort;
  }
  return new Promise<string>((resolve, reject) => {
    const request = https.get(opts, (response) => {
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
