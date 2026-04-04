import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TlsOptions } from "node:tls";

import { afterEach, expect, test, vi } from "vitest";

import {
  issueCertificate,
  IssueCertificateOptions,
} from "../https/certgen/issue-cert.ts";
import { generateCa } from "../https/certgen/generate-ca.ts";
import { boot, ProxyConfig } from "./reverse-proxy.js";

let proxyServer: http.Server | null = null;
let backendServers: http.Server[] = [];
let tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(backendServers.map(closeServer));
  backendServers = [];

  if (proxyServer != null) {
    await closeServer(proxyServer);
    proxyServer = null;
  }

  for (const tempDirectory of tempDirectories) {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
  tempDirectories = [];
});

test("proxies requests to the backend matched by host", async () => {
  await createBackendServer({
    port: 3000,
    body: "service on 3000",
    headers: {
      "Content-Type": "text/plain",
      "Set-Cookie": "session=abc123; HttpOnly",
      "X-Backend-Name": "service-on-3000",
    },
  });
  await createBackendServer({ port: 4000, body: "service on 4000" });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
      "example.test": { servers: [{ url: "http://localhost:4000" }] },
    },
  });

  const exampleDotComResponse = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });
  expect(exampleDotComResponse.statusCode).toBe(200);
  expect(exampleDotComResponse.body).toBe("service on 3000");
  expect(exampleDotComResponse.headers["content-type"]).toBe("text/plain");
  expect(exampleDotComResponse.headers["set-cookie"]).toEqual([
    "session=abc123; HttpOnly",
  ]);
  expect(exampleDotComResponse.headers["x-backend-name"]).toBe(
    "service-on-3000",
  );

  const exampleDotTestResponse = await makeProxyRequest({
    headers: {
      Host: "example.test",
    },
  });
  expect(exampleDotTestResponse.statusCode).toBe(200);
  expect(exampleDotTestResponse.body).toBe("service on 4000");
});

test("proxies requests when the Host header includes the port", async () => {
  await createBackendServer({ port: 3000, body: "service on 3000" });

  const { proxyPort, makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const exampleDotComWithPortResponse = await makeProxyRequest({
    headers: {
      Host: `example.com:${proxyPort}`,
    },
  });
  expect(exampleDotComWithPortResponse.statusCode).toBe(200);
  expect(exampleDotComWithPortResponse.body).toBe("service on 3000");
});

test("returns 400 when the Host header is missing", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    // Stop Node setting a Host header for this test.
    setHost: false,
  });

  expect(response.statusCode).toBe(400);
  expect(response.body).toBe("");
});

test("returns 400 when the Host header is malformed", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "exa mple.com",
    },
  });

  expect(response.statusCode).toBe(400);
  expect(response.body).toBe("Bad Request");
});

test("returns 502 when the Host header does not match a configured backend", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "unknown.example",
    },
  });

  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("returns 502 when the proxy cannot connect to the backend", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      // Assume nothing is listening on this high-numbered port.
      "example.com": { servers: [{ url: `http://localhost:54321` }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });
  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("returns 502 when backend closes the TCP connection before sending headers", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: (request) => {
      request.socket.destroy();
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });

  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("closes the downstream connection when backend closes mid-response", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: async (_request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/plain");
      response.write("partial backend body");
      await delay(20);
      response.socket?.destroy();
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("partial backend body");
  expect(response.closed).toBe(true);
  expect(response.ended).toBe(false);
});

test("uses 30s backend timeout by default", async () => {
  await createBackendServer({ port: 3000, body: "service on 3000" });

  const timeoutSpy = vi.spyOn(http.ClientRequest.prototype, "setTimeout");

  try {
    const { makeProxyRequest } = await createProxyServer({
      port: 0,
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
      },
    });

    const response = await makeProxyRequest({
      headers: {
        Host: "example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000, expect.any(Function));
  } finally {
    timeoutSpy.mockRestore();
  }
});

test("defaults to port 80 for HTTP proxies", () => {
  const listenSpy = mockServerListen(http.Server.prototype);

  try {
    boot({
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
      },
    });

    expect(listenSpy).toHaveBeenCalledWith(80, expect.any(Function));
  } finally {
    listenSpy.mockRestore();
  }
});

test("defaults to port 443 for HTTPS proxies", async () => {
  const { privateKeyPath, certPath } = await generateCertificates();
  const listenSpy = mockServerListen(https.Server.prototype);

  try {
    boot({
      proxyProtocol: "https",
      tls: {
        key: readFileSync(privateKeyPath),
        cert: readFileSync(certPath),
      },
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
        "example.test": { servers: [{ url: "http://localhost:4000" }] },
      },
    });

    expect(listenSpy).toHaveBeenCalledWith(443, expect.any(Function));
  } finally {
    listenSpy.mockRestore();
  }
});

test("explicit port overrides PROXY_PORT and protocol defaults", () => {
  const previousProxyPort = process.env.PROXY_PORT;
  process.env.PROXY_PORT = "1234";
  const listenSpy = mockServerListen(http.Server.prototype);

  try {
    boot({
      port: 5678,
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
      },
    });

    expect(listenSpy).toHaveBeenCalledWith(5678, expect.any(Function));
  } finally {
    listenSpy.mockRestore();

    if (previousProxyPort == null) {
      delete process.env.PROXY_PORT;
    } else {
      process.env.PROXY_PORT = previousProxyPort;
    }
  }
});

test("returns 504 when backend response exceeds configured timeout", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: async (_request, response) => {
      await delay(100);
      response.statusCode = 200;
      response.end("slow backend response");
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backendRequestTimeoutMs: 10,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });

  expect(response.statusCode).toBe(504);
  expect(response.body).toBe("Gateway Timeout");
});

test("passes through a 500 response from the backend", async () => {
  await createBackendServer({
    port: 3000,
    body: "backend error",
    statusCode: 500,
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });
  expect(response.statusCode).toBe(500);
  expect(response.body).toBe("backend error");
});

test("client method, headers and body are sent to backend", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: async (request, response) => {
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.end("Expected POST");
        return;
      }

      if (request.headers.cookie !== "session=abc123") {
        response.statusCode = 400;
        response.end("Missing cookie");
        return;
      }

      const requestBody = await readRequestBody(request);
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/plain");
      response.end(`${requestBody} backend modified!`);
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    method: "POST",
    headers: {
      Host: "example.com",
      Cookie: "session=abc123",
    },
    body: "hello from client",
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toBe("hello from client backend modified!");
});

test("replaces forwarding headers and preserves other headers", async () => {
  await createBackendServer({
    port: 3000,
    body: "unused",
    handleRequest: (request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          forwarded: request.headers.forwarded,
          xForwardedFor: request.headers["x-forwarded-for"],
          xForwardedHost: request.headers["x-forwarded-host"],
          xForwardedProto: request.headers["x-forwarded-proto"],
          xCustomHeader: request.headers["x-custom-header"],
        }),
      );
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com:1234",
      Forwarded: 'for="198.51.100.77";proto=https',
      "X-Forwarded-For": "198.51.100.77",
      "X-Forwarded-Host": "attacker.example",
      "X-Forwarded-Proto": "https",
      "X-Custom-Header": "keep-me",
    },
  });

  expect(response.statusCode).toBe(200);
  const forwardedHeaders = JSON.parse(response.body) as {
    forwarded?: string;
    xForwardedFor?: string;
    xForwardedHost?: string;
    xForwardedProto?: string;
    xCustomHeader?: string;
  };

  expect(forwardedHeaders.forwarded).toBeUndefined();
  expect(forwardedHeaders.xForwardedFor).toBe("::ffff:127.0.0.1");
  expect(forwardedHeaders.xForwardedHost).toBe("example.com:1234");
  expect(forwardedHeaders.xForwardedProto).toBe("http");
  expect(forwardedHeaders.xCustomHeader).toBe("keep-me");
});

test("supports HTTPS termination for client -> proxy for multiple domains", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: (request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          path: request.url,
          xForwardedProto: request.headers["x-forwarded-proto"],
        }),
      );
    },
  });
  await createBackendServer({
    port: 4000,
    handleRequest: (request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          path: request.url,
          xForwardedProto: request.headers["x-forwarded-proto"],
        }),
      );
    },
  });

  // Generate a certificate for the reverse proxy supporting all domains it forwards for.
  const { caRootCertPath, privateKeyPath, certPath } =
    await generateCertificates({
      dnsNames: ["example.com", "example.test"],
    });

  const { proxyPort } = await createProxyServer({
    port: 0,
    proxyProtocol: "https",
    tls: { key: readFileSync(privateKeyPath), cert: readFileSync(certPath) },
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
      "example.test": { servers: [{ url: "http://localhost:4000" }] },
    },
  });

  // Check example.com HTTPS request succeeds.
  const responseCom = await makeHttpsRequest({
    headers: {
      Host: "example.com",
    },
    path: "/via-https-proxy",
    port: proxyPort,
    requestOptions: {
      ca: readFileSync(caRootCertPath),
    },
  });

  expect(responseCom.statusCode).toBe(200);
  const payloadCom = JSON.parse(responseCom.body) as {
    path?: string;
    xForwardedProto?: string;
  };
  expect(payloadCom.path).toBe("/via-https-proxy");
  expect(payloadCom.xForwardedProto).toBe("https");

  // Check we can do our different domain and HTTPS validation still succeeds - example.test
  const responseTest = await makeHttpsRequest({
    headers: {
      Host: "example.test",
    },
    path: "/via-https-proxy",
    port: proxyPort,
    requestOptions: {
      ca: readFileSync(caRootCertPath),
    },
  });

  expect(responseTest.statusCode).toBe(200);
  const payloadTest = JSON.parse(responseTest.body) as {
    path?: string;
    xForwardedProto?: string;
  };
  expect(payloadTest.path).toBe("/via-https-proxy");
  expect(payloadTest.xForwardedProto).toBe("https");
});

test("throws when HTTPS proxyProtocol is configured without TLS key/cert", () => {
  expect(() =>
    boot({
      port: 0,
      proxyProtocol: "https",
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
      },
    }),
  ).toThrow(
    'ProxyConfig.tls must include both "key" and "cert" when proxyProtocol is "https"',
  );
});

test("throws when HTTPS proxyProtocol is configured with cert but no key", () => {
  expect(() =>
    boot({
      port: 0,
      proxyProtocol: "https",
      tls: {
        cert: "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----",
      },
      backends: {
        "example.com": { servers: [{ url: "http://localhost:3000" }] },
      },
    }),
  ).toThrow(
    'ProxyConfig.tls must include both "key" and "cert" when proxyProtocol is "https"',
  );
});
test("one client can make requests to two different paths on the same backend", async () => {
  await createBackendServer({
    port: 3000,
    handleRequest: (request, response) => {
      response.statusCode = 200;
      response.end(`backend saw path ${request.url}`);
    },
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const firstResponse = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
    path: "/first-path",
  });
  expect(firstResponse.statusCode).toBe(200);
  expect(firstResponse.body).toBe("backend saw path /first-path");

  const secondResponse = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
    path: "/second-path",
  });
  expect(secondResponse.statusCode).toBe(200);
  expect(secondResponse.body).toBe("backend saw path /second-path");
});

test("returns 502 when a backend has no servers", async () => {
  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
  });

  expect(response.statusCode).toBe(502);
  expect(response.body).toBe("Bad Gateway");
});

test("supports random load balancing policy", async () => {
  await createBackendServer({ port: 3000, body: "service on 3000" });
  await createBackendServer({ port: 4000, body: "service on 4000" });

  const randomSpy = vi
    .spyOn(Math, "random")
    .mockReturnValueOnce(0.01)
    .mockReturnValueOnce(0.99);

  try {
    const { makeProxyRequest } = await createProxyServer({
      port: 0,
      backends: {
        "example.com": {
          servers: [
            { url: "http://localhost:3000" },
            { url: "http://localhost:4000" },
          ],
          loadBalancingPolicy: "random",
        },
      },
    });

    const firstResponse = await makeProxyRequest({
      headers: {
        Host: "example.com",
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body).toBe("service on 3000");

    const secondResponse = await makeProxyRequest({
      headers: {
        Host: "example.com",
      },
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body).toBe("service on 4000");
  } finally {
    randomSpy.mockRestore();
  }
});

test("rejects absolute-form URL request targets to prevent backend override attacks", async () => {
  await createBackendServer({
    port: 3000,
    body: "trusted backend",
  });
  await createBackendServer({
    port: 4000,
    body: "attacker backend",
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
    path: "http://127.0.0.1:4000/steal-data",
  });

  expect(response.statusCode).toBe(400);
  expect(response.body).toBe("Bad Request");
});

test("rejects same-host absolute-form URL request targets", async () => {
  await createBackendServer({
    port: 3000,
    body: "trusted backend",
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
    path: "http://example.com/steal-data",
  });

  expect(response.statusCode).toBe(400);
  expect(response.body).toBe("Bad Request");
});

test("rejects network-path URL request targets to prevent backend override attacks", async () => {
  await createBackendServer({
    port: 3000,
    body: "trusted backend",
  });
  await createBackendServer({
    port: 4000,
    body: "attacker backend",
  });

  const { makeProxyRequest } = await createProxyServer({
    port: 0,
    backends: {
      "example.com": { servers: [{ url: "http://localhost:3000" }] },
    },
  });

  const response = await makeProxyRequest({
    headers: {
      Host: "example.com",
    },
    path: "//127.0.0.1:4000/steal-data",
  });

  expect(response.statusCode).toBe(400);
  expect(response.body).toBe("Bad Request");
});

async function createBackendServer({
  port,
  body,
  statusCode = 200,
  headers = {},
  handleRequest,
}: {
  port: number;
  body?: string;
  statusCode?: number;
  headers?: http.OutgoingHttpHeaders;
  handleRequest?: (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => void | Promise<void>;
}) {
  const server = http.createServer(async (request, response) => {
    if (handleRequest != null) {
      await handleRequest(request, response);
      return;
    }

    response.statusCode = statusCode;
    for (const [headerName, headerValue] of Object.entries(headers)) {
      response.setHeader(headerName, headerValue ?? "");
    }
    response.end(body ?? "");
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
    makeProxyRequest: ({
      method = "GET",
      headers = {},
      body,
      path = "/",
      setHost = true,
    }: {
      method?: string;
      headers?: http.OutgoingHttpHeaders;
      body?: string;
      path?: string;
      setHost?: boolean;
    }) =>
      makeRequest({
        body,
        headers,
        method,
        path,
        port: proxyAddress.port,
        setHost,
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

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mockServerListen(serverPrototype: {
  listen: (...args: any[]) => unknown;
}) {
  return vi
    .spyOn(serverPrototype as any, "listen")
    .mockImplementation(function (this: unknown, ...args: unknown[]) {
      const callback = args.at(-1);
      if (typeof callback === "function") {
        callback();
      }

      return this;
    });
}

function makeRequest({
  body,
  headers = {},
  method = "GET",
  path = "/",
  port,
  setHost = true,
}: {
  body?: string;
  headers?: http.OutgoingHttpHeaders;
  method?: string;
  path?: string;
  port: number;
  setHost?: boolean;
}) {
  return new Promise<{
    body: string;
    closed: boolean;
    ended: boolean;
    headers: http.IncomingHttpHeaders;
    statusCode: number | undefined;
  }>((resolve, reject) => {
    const request = http.request(
      {
        // Which IP to open the TCP connection to.
        hostname: "127.0.0.1",
        method,
        port,
        path,
        headers,
        setHost,
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
            closed: false,
            ended: true,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
        response.on("close", () => {
          if (!response.complete) {
            resolve({
              body,
              closed: true,
              ended: false,
              headers: response.headers,
              statusCode: response.statusCode,
            });
          }
        });
        response.on("error", () => {
          resolve({
            body,
            closed: true,
            ended: false,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    if (body != null) {
      request.write(body);
    }
    request.end();
  });
}

function makeHttpsRequest({
  body,
  headers = {},
  method = "GET",
  path = "/",
  port,
  requestOptions = {},
  setHost = true,
}: {
  body?: string;
  headers?: http.OutgoingHttpHeaders;
  method?: string;
  path?: string;
  port: number;
  requestOptions?: https.RequestOptions;
  setHost?: boolean;
}) {
  return new Promise<{
    body: string;
    closed: boolean;
    ended: boolean;
    headers: http.IncomingHttpHeaders;
    statusCode: number | undefined;
  }>((resolve, reject) => {
    const request = https.request(
      {
        hostname: "127.0.0.1",
        method,
        port,
        path,
        headers,
        setHost,
        ...requestOptions,
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
            closed: false,
            ended: true,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
        response.on("close", () => {
          if (!response.complete) {
            resolve({
              body,
              closed: true,
              ended: false,
              headers: response.headers,
              statusCode: response.statusCode,
            });
          }
        });
        response.on("error", () => {
          resolve({
            body,
            closed: true,
            ended: false,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    if (body != null) {
      request.write(body);
    }
    request.end();
  });
}

async function generateCertificates(
  options: IssueCertificateOptions = {
    dnsNames: ["localhost"],
    ipAddresses: ["127.0.0.1"],
  },
) {
  const baseDirectory = mkdtempSync(join(tmpdir(), "proxy-https-test-"));
  tempDirectories.push(baseDirectory);
  const caDirectoryPath = join(baseDirectory, "ca");
  const issuedDirectory = join(baseDirectory, "issued");

  await generateCa({ outputDirectoryPath: caDirectoryPath });
  return issueCertificate({
    outputDirectoryPath: issuedDirectory,
    caDirectoryPath,
    ...options,
  });
}

function readRequestBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", reject);
  });
}
