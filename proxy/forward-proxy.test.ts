import * as http from "node:http";

import { afterEach, expect, test } from "vitest";

import { boot } from "./forward-proxy.js";

let backendServer: http.Server | null = null;
let proxyServer: http.Server | null = null;

afterEach(async () => {
  if (backendServer != null) {
    await closeServer(backendServer);
    backendServer = null;
  }

  if (proxyServer != null) {
    await closeServer(proxyServer);
    proxyServer = null;
  }
});

test("forwards a basic HTTP request to its destination", async () => {
  backendServer = http.createServer(async (request, response) => {
    const requestBody = await readRequestBody(request);

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        body: requestBody,
        method: request.method,
        path: request.url,
      }),
    );
  });
  backendServer.listen(0);
  await waitForListening(backendServer);

  const backendAddress = backendServer.address();
  if (backendAddress == null || typeof backendAddress === "string") {
    throw new Error("Expected backend server to listen on a TCP port");
  }

  proxyServer = boot({ port: 0 });
  await waitForListening(proxyServer);

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }

  const response = await makeRequest({
    method: "POST",
    body: "hello from client",
    path: `http://127.0.0.1:${backendAddress.port}/hello?via=proxy`,
    port: proxyAddress.port,
  });

  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toBe("application/json");
  expect(response.body).toBe(
    JSON.stringify({
      body: "hello from client",
      method: "POST",
      path: "/hello?via=proxy",
    }),
  );
});

function waitForListening(server: http.Server) {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeServer(server: http.Server) {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function makeRequest({
  body,
  method,
  path,
  port,
}: {
  body: string;
  method: string;
  path: string;
  port: number;
}) {
  return new Promise<{
    body: string;
    headers: http.IncomingHttpHeaders;
    statusCode: number | undefined;
  }>((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        method,
        path,
        port,
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            body: responseBody,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function readRequestBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}
