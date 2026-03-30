import { readFileSync } from "node:fs";
import * as https from "node:https";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { generateCertificateTest } from "../openssl-node-https-certs-demo/generate-certificate-test.ts";

test("https", async () => {
  expect.hasAssertions();

  const { serverPrivateKeyPath, serverSignedCertPath } =
    await generateCertificateTest(resolve(process.cwd(), "build"));

  // Boot the server.
  const server = https.createServer(
    {
      key: readFileSync(serverPrivateKeyPath),
      cert: readFileSync(serverSignedCertPath),
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
      { rejectUnauthorized: false },
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
