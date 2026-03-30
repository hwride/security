import { readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateCertificateTest } from "../openssl-node-https-certs-demo/generate-certificate-test.ts";

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

  /* Create:
      1) A self-signed certificate authority certificate. We will use this as a trusted root certificate.
      2) A server certificate, signed by our custom CA. And a server private key.
         These will be used to boot our HTTPS server.
   */
  const { caRootCertPath, serverPrivateKeyPath, serverSignedCertPath } =
    await generateCertificateTest({
      outputDirectoryPath: resolve(process.cwd(), "build"),
    });

  await bootHttpsServer(serverSignedCertPath, serverPrivateKeyPath);

  // Check we can make a HTTPS request.
  await new Promise<void>((resolve, reject) => {
    const request = https.get(
      "https://localhost:8080",
      // Pass our self-signed CA certificate to our HTTPS request as a trusted root.
      // This will then be used to check the server certificate's signature for authenticity.
      { ca: readFileSync(caRootCertPath) },
      (response) => {
        let data = "";

        response.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });

        response.on("end", () => {
          try {
            expect(data).toBe("HTTPS response");
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
  });
});

test("server certificate is not signed by a trusted root certificate", async () => {
  expect.hasAssertions();

  /* Create:
      1) A self-signed certificate authority certificate.
      2) A server certificate, signed by our custom CA. And a server private key.
         These will be used to boot our HTTPS server.
   */
  const { serverPrivateKeyPath, serverSignedCertPath } =
    await generateCertificateTest({
      outputDirectoryPath: resolve(process.cwd(), "build"),
    });

  await bootHttpsServer(serverSignedCertPath, serverPrivateKeyPath);

  // Check the HTTPS request fails because the server certificate is not signed by a trusted root certificate.
  expect(
    new Promise<void>((resolve, reject) => {
      const request = https.get(
        "https://localhost:8080",
        // Don't include our custom CA cert here, to cause the HTTPS request to fail due to an untrusted signature.
        () => {
          resolve();
        },
      );

      request.on("error", reject);
    }),
  ).rejects.toMatchObject({
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    message: expect.stringContaining("unable to verify the first certificate"),
  });
});

test("server certificate is signed correctly, but hostname does not match the requested hostname", async () => {
  expect.hasAssertions();

  const { caRootCertPath, serverPrivateKeyPath, serverSignedCertPath } =
    await generateCertificateTest({
      outputDirectoryPath: resolve(process.cwd(), "build"),
      serverDnsNames: ["example.test"],
    });

  await bootHttpsServer(serverSignedCertPath, serverPrivateKeyPath);

  expect(
    new Promise<void>((resolve, reject) => {
      const request = https.get(
        "https://localhost:8080",
        { ca: readFileSync(caRootCertPath) },
        () => {
          resolve();
        },
      );

      request.on("error", reject);
    }),
  ).rejects.toMatchObject({
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
    message: expect.stringContaining("does not match certificate's altnames"),
  });
});

async function bootHttpsServer(
  serverSignedCertPath: string,
  serverPrivateKeyPath: string,
) {
  server = https.createServer(
    {
      // Pass in the server's HTTPS certificate.
      // The certificate contains the server's public key and other identifying information such as domain name.
      // It is signed by our custom certificate authority, which we will tell the client to trust. So the client
      // can later verify the signature on the server certificate is trusted.
      cert: readFileSync(serverSignedCertPath),

      // Pass in the server's private key.
      // During the TLS handshake, the server will prove it is the legitimate holder of the certificate by proving
      // it owns the private key corresponding to the public key embedded in the certificate.
      // It does this by signing fresh handshake data with its private key, which the client can then
      // verify using the public key embedded in the certificate.
      key: readFileSync(serverPrivateKeyPath),
    },
    function handleRequest(_request, response) {
      response.writeHead(200);
      response.end("HTTPS response");
    },
  );

  await new Promise<void>((resolve) => {
    server!.listen(8080, resolve);
  });
}
