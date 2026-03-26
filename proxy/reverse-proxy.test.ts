import * as http from "node:http";

import { afterEach, expect, test } from "vitest";

import { boot } from "./reverse-proxy.js";

let servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map(closeServer));
  servers = [];
});

test("proxies requests to the backend matched by host", async () => {
  servers.push(
    createBackendServer(3000, "service on 3000"),
    createBackendServer(4000, "service on 4000"),
  );

  const proxyServer = boot({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
      "example.test": "http://localhost:4000",
    },
  });
  servers.push(proxyServer);

  await Promise.all(servers.map(waitForListening));

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }
  console.log(`Proxy listening on port ${proxyAddress.port}`);

  const exampleDotComResponse = await makeRequest(
    proxyAddress.port,
    "example.com",
  );
  expect(exampleDotComResponse.statusCode).toBe(200);
  expect(exampleDotComResponse.body).toBe("service on 3000");

  const exampleDotTestResponse = await makeRequest(
    proxyAddress.port,
    "example.test",
  );
  expect(exampleDotTestResponse.statusCode).toBe(200);
  expect(exampleDotTestResponse.body).toBe("service on 4000");
});

test("proxies requests when the Host header includes the port", async () => {
  servers.push(createBackendServer(3000, "service on 3000"));

  const proxyServer = boot({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
    },
  });
  servers.push(proxyServer);

  await Promise.all(servers.map(waitForListening));

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }

  const exampleDotComWithPortResponse = await makeRequest(
    proxyAddress.port,
    `example.com:${proxyAddress.port}`,
  );
  expect(exampleDotComWithPortResponse.statusCode).toBe(200);
  expect(exampleDotComWithPortResponse.body).toBe("service on 3000");
});

test("returns 502 when the proxy cannot connect to the backend", async () => {
  // Assume nothing is listening on this high-numbered port.
  const unavailablePort = 54321;

  const proxyServer = boot({
    port: 0,
    backendByHostname: {
      "example.com": `http://localhost:${unavailablePort}`,
    },
  });
  servers.push(proxyServer);

  await Promise.all(servers.map(waitForListening));

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }

  const response = await makeRequest(proxyAddress.port, "example.com");
  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("passes through a 500 response from the backend", async () => {
  servers.push(createBackendServer(3000, "backend error", 500));

  const proxyServer = boot({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
    },
  });
  servers.push(proxyServer);

  await Promise.all(servers.map(waitForListening));

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }

  const response = await makeRequest(proxyAddress.port, "example.com");
  expect(response.statusCode).toBe(500);
  expect(response.body).toBe("backend error");
});

function createBackendServer(port: number, body: string, statusCode = 200) {
  const server = http.createServer((_request, response) => {
    response.statusCode = statusCode;
    response.end(body);
  });

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
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
  return new Promise<{ body: string; statusCode: number | undefined }>(
    (resolve, reject) => {
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
    },
  );
}
