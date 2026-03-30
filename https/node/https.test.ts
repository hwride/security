import { get } from "node:https";
import { expect, test } from "vitest";

test("https", async () => {
  expect.hasAssertions();

  const { server, serverListening } = await import("./https-server.ts");
  await serverListening;

  await new Promise<void>((resolve, reject) => {
    const request = get(
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
