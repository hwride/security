import * as http from "node:http";

import { afterEach, expect, test } from "vitest";

import { boot } from "./reverse-proxy.js";

let servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map(closeServer));
  servers = [];
});

test("proxies requests to the downstream service matched by host", async () => {
  servers.push(
    createDownstreamServer(3000, "service on 3000"),
    createDownstreamServer(4000, "service on 4000"),
  );

  const proxyServer = boot({ port: 0 });
  servers.push(proxyServer);

  await Promise.all(servers.map(waitForListening));

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }
  console.log(`Proxy listening on port ${proxyAddress.port}`)

  const exampleDotComResponse = await makeRequest(proxyAddress.port, "example.com");
  expect(exampleDotComResponse.statusCode).toBe(200);
  expect(exampleDotComResponse.body).toBe("service on 3000");

  const exampleDotTestResponse = await makeRequest(proxyAddress.port, "example.test");
  expect(exampleDotTestResponse.statusCode).toBe(200);
  expect(exampleDotTestResponse.body).toBe("service on 4000");
});

function createDownstreamServer(port: number, body: string) {
  const server = http.createServer((_request, response) => {
    response.statusCode = 200;
    response.end(body);
  });

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`)
  });
  return server;
}

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

function makeRequest(port: number, host: string) {
  return new Promise<{ body: string; statusCode: number | undefined }>((resolve, reject) => {
    const request = http.request(
      {
        // Which IP to open the TCP connection to.
        hostname: "127.0.0.1",
        port,
        path: "/",
        method: "GET",
        headers: {
          // HTTP Host header.
          host,
        },
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            body,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}
