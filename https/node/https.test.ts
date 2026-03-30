import { readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { generateCertificateTest } from "../openssl-node-https-certs-demo/generate-certificate-test.ts";

test("https", async () => {
  expect.hasAssertions();

  /* Create:
      1) A self-signed certificate authority certificate. We will use this as a trusted root certificate.
      2) A server certificate, signed by our custom CA. And a server private key.
         These will be used to boot our HTTPS server.
   */
  const { caRootCertPath, serverPrivateKeyPath, serverSignedCertPath } =
    await generateCertificateTest(resolve(process.cwd(), "build"));

  // Boot our HTTPS server.
  const server = https.createServer(
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
    server.listen(8080, resolve);
  });

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

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});
