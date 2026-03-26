import * as http from "node:http";

import { afterEach, expect, test } from "vitest";

import { boot, ProxyConfig } from "./reverse-proxy.js";

let proxyServer: http.Server | null = null;
let backendServers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(backendServers.map(closeServer));
  backendServers = [];

  if (proxyServer != null) {
    await closeServer(proxyServer);
    proxyServer = null;
  }
});

test("proxies requests to the backend matched by host", async () => {
  await createBackendServer(3000, "service on 3000");
  await createBackendServer(4000, "service on 4000");

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
      "example.test": "http://localhost:4000",
    },
  });

  const exampleDotComResponse = await makeProxyRequest({
    hostHeader: "example.com",
  });
  expect(exampleDotComResponse.statusCode).toBe(200);
  expect(exampleDotComResponse.body).toBe("service on 3000");

  const exampleDotTestResponse = await makeProxyRequest({
    hostHeader: "example.test",
  });
  expect(exampleDotTestResponse.statusCode).toBe(200);
  expect(exampleDotTestResponse.body).toBe("service on 4000");
});

test("proxies requests when the Host header includes the port", async () => {
  await createBackendServer(3000, "service on 3000");

  const { proxyPort, makeProxyRequest } = await createProxyServer({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
    },
  });

  const exampleDotComWithPortResponse = await makeProxyRequest({
    hostHeader: `example.com:${proxyPort}`,
  });
  expect(exampleDotComWithPortResponse.statusCode).toBe(200);
  expect(exampleDotComWithPortResponse.body).toBe("service on 3000");
});

test("returns 502 when the proxy cannot connect to the backend", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backendByHostname: {
      // Assume nothing is listening on this high-numbered port.
      "example.com": `http://localhost:54321`,
    },
  });

  const response = await makeProxyRequest({
    hostHeader: "example.com",
  });
  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("passes through a 500 response from the backend", async () => {
  await createBackendServer(3000, "backend error", 500);

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backendByHostname: {
      "example.com": "http://localhost:3000",
    },
  });

  const response = await makeProxyRequest({
    hostHeader: "example.com",
  });
  expect(response.statusCode).toBe(500);
  expect(response.body).toBe("backend error");
});

async function createBackendServer(
  port: number,
  body: string,
  statusCode = 200,
) {
  const server = http.createServer((_request, response) => {
    response.statusCode = statusCode;
    response.end(body);
  });

  backendServers.push(server);
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  await waitForListening(server);
}

async function createProxyServer(config: ProxyConfig) {
  proxyServer = boot(config);
  await waitForListening(proxyServer);

  const proxyAddress = proxyServer.address();
  if (proxyAddress == null || typeof proxyAddress === "string") {
    throw new Error("Expected proxy server to listen on a TCP port");
  }

  return {
    proxyPort: proxyAddress.port,
    proxyServer,
    makeProxyRequest: ({ hostHeader }: { hostHeader: string }) =>
      makeRequest({
        port: proxyAddress.port,
        hostHeader,
      }),
  };
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

function makeRequest({
  port,
  hostHeader,
}: {
  port: number;
  hostHeader: string;
}) {
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
            host: hostHeader,
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
