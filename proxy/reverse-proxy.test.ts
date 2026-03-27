import * as http from "node:http";

import { afterEach, expect, test, vi } from "vitest";

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
