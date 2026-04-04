import { createServer, IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_VALUE = "demo-session";
let corsSendAllowOrigin = true;
let corsAllowOrigin: "*" | "https://attacker.com" = "*";
let corsAllowAllCredentials = false;

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    console.error(error);

    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    response.end("Internal Server Error");
  }
});

server.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(
      response,
      `<html>
<head>
  <title>App</title>
  <style>
    h2 {
        margin-block-end: 4px;
    }
    h3 {
        margin-block-end: 4px;
    }
    p {
        margin-block: 4px;
    }
    form, pre {
        margin: 0;
    }
    .example {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
  </style>
</head>
<body>
  <h1>App</h1>
  <h2>Login actions</h2>
  <div style="display: flex; flex-direction: column; gap: 8px">
    ${hasValidSession(request) ? `<div style="color: green">Logged in</div>` : `<div style="color: red">Logged out</div>`}
    <form method="POST" action="/login?sameSite=default">
      <button type="submit">Log in - <code>SameSite</code> not supplied</button>
      <span>
        - cookies now generally default to <code>Lax</code>. But when you do not include <code>SameSite=Lax</code> 
        explicitly then some browers will allow these cookies to be used cross-site for up to 2 minutes for top-level
        navigation requests (not sub-resource requests e.g. <code>fetch</code>). See 
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax">MDN <code>Lax</code></a>
        docs and the new 
        <a href="https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.6.7.2">
          draft updated Cookies spec <code>Lax-Allowing-Unsafe</code></a>. 
        These cookies will be vulnerable to CSRF during this window.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=none&secure=true">
      <button type="submit">Log in - <code>SameSite=None; Secure</code></button>
      <span>
        - <code>None</code> means cookies will be sent on any requests, including cross-site.
        These cookies will be vulnerable to CSRF.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=none">
      <button type="submit">Log in - <code>SameSite=None</code></button>
      <span>
        - Modern browsers won't event set <code>None</code> cookies without also including the <code>Secure</code> attribute.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=lax">
      <button type="submit">Log in - <code>SameSite=Lax</code></button>
      <span>
        - 
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax"><code>Lax</code></a> 
        means cookies will only be sent on cross-site requests for top-level navigations using a safe HTTP methods
        (<code>GET</code>, <code>HEAD</code> or <code>OPTIONS</code>).
        These cookies can be vulnerable to CSRF if you use a state changing endpoint with a safe HTTP method.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=strict">
      <button type="submit">Log in - <code>SameSite=Strict</code></button>
      <span>
        - <code>Strict</code> means cookies will only ever be sent on same-site requests.
        These cookies are generally safe against CSRF.
      </span>
    </form>
    <form method="POST" action="/logout">
      <button type="submit">Log out</button>
    </form>
  </div>

  <h2>CORS options</h2>
  <p>
    CORS headers that will be sent for our endpoints under test:
  </p>
  <form method="POST" action="/update-cors-settings" style="display: flex; flex-direction: column; gap: 8px; align-items: flex-start;">
    <label>
      <input
        type="checkbox"
        name="sendAllowOrigin"
        ${corsSendAllowOrigin ? "checked" : ""}
      />
      <code>Access-Control-Allow-Origin</code>
      <select name="allowOrigin">
        <option value="*" ${corsAllowOrigin === "*" ? "selected" : ""}>*</option>
        <option value="https://attacker.com" ${corsAllowOrigin === "https://attacker.com" ? "selected" : ""}>attacker.com</option>
      </select>
    </label>
    <label>
      <input
        type="checkbox"
        name="allowAllCredentials"
        ${corsAllowAllCredentials ? "checked" : ""}
      />
      <code>Access-Control-Allow-Credentials: true</code>
    </label>
    <button type="submit">Update CORS settings</button>
  </form>
  
  <h2>Authenticated endpoints</h2>
  
  <div class="example">
    <h3>Standard HTML POST form - top-level navigation + unsafe HTTP method</h3>
    <pre>
POST /transfer
Content-Type: application/x-www-form-urlencoded
Request type: top-level navigation
    </pre>
    <form method="POST" action="/transfer">
      <label>
        To
        <input type="text" name="to" value="alice" />
      </label>
      <label>
        Amount
        <input type="text" name="amount" value="100" />
      </label>
      <button type="submit">Send money</button>
    </form>
   </div>

  <div class="example">
    <h3>Standard HTML GET form - top-level navigation + safe HTTP method</h3>
    <pre>
GET /transfer-get?to=alice&amount=100
Content-Type: none
Request type: top-level navigation
    </pre>
    <form method="GET" action="/transfer-get">
      <label>
        To
        <input type="text" name="to" value="alice" />
      </label>
      <label>
        Amount
        <input type="text" name="amount" value="100" />
      </label>
      <button type="submit">Send money</button>
    </form>
  </div>
  
  <div class="example">
    <h3>POST JSON fetch request - sub-resource request + unsafe HTTP method</h3>
    <pre>
POST /transfer-json
Content-Type: application/json
Request type: sub-resource request
    </pre>
    <code>POST /transfer-json, application/json, fetch</code>
    <p class="eg-desc">
      This uses a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#simple_requests">non-simple</a> 
      <code>Content-Type</code> so a cross-origin request requires a CORS pre-flight.
    </p>
    <div>
      <label>
        To
        <input type="text" id="transfer-json-to" value="alice" />
      </label>
      <label>
        Amount
        <input type="text" id="transfer-json-amount" value="100" />
      </label>
      <button type="button" id="send-transfer">Send money</button>
    </div>
    <div>Result: <span class="transfer-json-result"></span></div>
  </div>

  <script>
    const button = document.getElementById("send-transfer");
    const toInput = document.getElementById("transfer-json-to");
    const amountInput = document.getElementById("transfer-json-amount");
    button.addEventListener("click", async () => {
      document.querySelector('.transfer-json-result').replaceChildren('Loading...')
      
      const response = await fetch("/transfer-json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ to: toInput.value, amount: amountInput.value }),
      });

      const resultText = await response.text()
      document.querySelector('.transfer-json-result').replaceChildren('code: ' + response.status + ', text: ' + resultText)
    });
  </script>
</body>
</html>`,
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/login") {
    let sessionCookie = `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; HttpOnly`;

    // Add requested SameSite value. Only for testing - of course you don't want this to be user controlled in real apps.
    const sameSiteVal = {
      none: "None",
      lax: "Lax",
      strict: "Strict",
    }[url.searchParams.get("sameSite") ?? ""];
    if (sameSiteVal) {
      sessionCookie += `; SameSite=${sameSiteVal}`;
    }
    // None cookies require the Secure attribute as well or the browser won't accept them.
    if (url.searchParams.get("secure") === "true") {
      sessionCookie += `; Secure`;
    }

    response.statusCode = 303;
    response.setHeader("Set-Cookie", sessionCookie);
    response.setHeader("Location", "/");
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/logout") {
    response.statusCode = 303;
    response.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    response.setHeader("Location", "/");
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/update-cors-settings") {
    const formBody = await parseFormBody(request);

    corsSendAllowOrigin = formBody.sendAllowOrigin != null;
    corsAllowOrigin =
      formBody.allowOrigin === "https://attacker.com"
        ? "https://attacker.com"
        : "*";
    corsAllowAllCredentials = formBody.allowAllCredentials != null;

    response.statusCode = 303;
    response.setHeader("Location", "/");
    response.end();
    return;
  }

  // Authenticated with cookie, POST, application/x-www-form-urlencoded
  if (request.method === "POST" && url.pathname === "/transfer") {
    applyCorsHeaders(response);

    if (!hasValidSession(request)) {
      response.statusCode = 401;
      response.end("Unauthorized");
      return;
    }

    const { amount, to } = await parseFormBody(request);
    response.statusCode = 200;
    response.end(`Transferred ${amount} to ${to}`);
    return;
  }

  // Authenticated with cookie, GET, query string, top-level navigation
  if (request.method === "GET" && url.pathname === "/transfer-get") {
    applyCorsHeaders(response);

    if (!hasValidSession(request)) {
      response.statusCode = 401;
      response.end("Unauthorized");
      return;
    }

    const amount = url.searchParams.get("amount") ?? "";
    const to = url.searchParams.get("to") ?? "";
    response.statusCode = 200;
    response.end(`Transferred ${amount} to ${to}`);
    return;
  }

  // Pre-flight request
  if (request.method === "OPTIONS" && url.pathname === "/transfer-json") {
    applyCorsHeaders(response);
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.statusCode = 204;
    response.end();
    return;
  }

  // Authenticated with cookie, POST, application/json
  if (request.method === "POST" && url.pathname === "/transfer-json") {
    applyCorsHeaders(response);

    if (!hasValidSession(request)) {
      response.statusCode = 401;
      response.end("Unauthorized");
      return;
    }

    const { amount, to } = await parseJsonBody(request);
    response.statusCode = 200;
    response.end(`Transferred ${amount} to ${to}`);
    return;
  }

  if (request.method === "GET" && url.pathname === "/json") {
    sendJson(response, { json: "value" });
    return;
  }

  response.statusCode = 404;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Not Found");
}

function hasValidSession(request: IncomingMessage) {
  if (!request.headers.cookie) {
    return false;
  }

  const cookies = request.headers.cookie
    .split(";")
    .map((cookie) => cookie.trim());
  return cookies.includes(`${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`);
}

async function parseFormBody(request: IncomingMessage) {
  const rawBody = await readRequestBody(request);
  const parsed = new URLSearchParams(rawBody);

  return {
    to: parsed.get("to") ?? undefined,
    amount: parsed.get("amount") ?? undefined,
    sendAllowOrigin: parsed.get("sendAllowOrigin") ?? undefined,
    allowOrigin: parsed.get("allowOrigin") ?? undefined,
    allowAllCredentials: parsed.get("allowAllCredentials") ?? undefined,
  };
}

async function parseJsonBody(request: IncomingMessage) {
  const rawBody = await readRequestBody(request);

  if (rawBody === "") {
    return {};
  }

  const parsed = JSON.parse(rawBody);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return {
    to: getOptionalString(parsed.to),
    amount: getOptionalString(parsed.amount),
  };
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", (error) => {
      reject(error);
    });
  });
}

function applyCorsHeaders(response: ServerResponse) {
  if (corsSendAllowOrigin) {
    response.setHeader("Access-Control-Allow-Origin", corsAllowOrigin);
  }

  if (corsAllowAllCredentials) {
    response.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

function sendHtml(response: ServerResponse, body: string, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(body);
}

function sendJson(
  response: ServerResponse,
  body: Record<string, string>,
  statusCode = 200,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
