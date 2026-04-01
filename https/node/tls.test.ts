import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as tls from "node:tls";
import { afterEach, expect, test } from "vitest";
import { generateCa } from "../certgen/generate-ca.ts";
import {
  issueCertificate,
  IssueCertificateOptions,
} from "../certgen/issue-cert.ts";

const serverPort = 8443;
let server: tls.Server | undefined;

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

test("tls connection without servername uses IP SAN", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: [],
      ipAddresses: ["127.0.0.1"],
    });

  await bootTlsServer(certPath, privateKeyPath);

  const response = await makeTlsRequest({
    ca: readFileSync(caRootCertPath),
    host: "127.0.0.1",
    port: serverPort,
  });

  expect(response).toBe("TLS response");
});

test("tls connection with servername uses DNS SAN", async () => {
  expect.hasAssertions();

  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: ["example.test"],
      ipAddresses: [],
    });

  await bootTlsServer(certPath, privateKeyPath);

  const response = await makeTlsRequest({
    ca: readFileSync(caRootCertPath),
    // We connect directly to the server IP, so DNS lookup for example.test is skipped.
    // But the DNS SAN check in the server TLS certificate is still checked against the provided servername.
    host: "127.0.0.1",
    port: serverPort,
    // Server name for the SNI (Server Name Indication) TLS extension.
    servername: "example.test",
  });

  expect(response).toBe("TLS response");
});

async function generateCertificates(options: IssueCertificateOptions = {}) {
  const caDirectoryPath = resolve(process.cwd(), `build-tls-ca`);
  const issuedCertDirectoryPath = resolve(
    process.cwd(),
    `build-tls-issued-cert`,
  );

  await generateCa({ outputDirectoryPath: caDirectoryPath });
  return issueCertificate({
    outputDirectoryPath: issuedCertDirectoryPath,
    caDirectoryPath,
    ...options,
  });
}

async function bootTlsServer(certPath: string, privateKeyPath: string) {
  server = tls.createServer(
    {
      cert: readFileSync(certPath),
      key: readFileSync(privateKeyPath),
    },
    (socket) => {
      socket.write("TLS response");
      socket.end();
    },
  );

  await new Promise<void>((resolve) => {
    server!.listen(serverPort, resolve);
  });
}

function makeTlsRequest(options: tls.ConnectionOptions) {
  return new Promise<string>((resolve, reject) => {
    const socket = tls.connect(options);

    let data = "";

    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });

    socket.on("end", () => {
      resolve(data);
    });

    socket.on("error", reject);
  });
}
