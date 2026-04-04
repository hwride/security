import { createServer, IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_VALUE = "demo-session";

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
    p {
        margin-block: 4px;
    }
    form {
        margin: 0;
    }
  </style>
</head>
<body>
  <h1>App</h1>
  <div style="display: flex; flex-direction: column; gap: 8px">
    ${hasValidSession(request) ? `<div style="color: green">Logged in</div>` : `<div style="color: red">Logged out</div>`}
    <form method="POST" action="/login?sameSite=default">
      <button type="submit">Log in - <code>SameSite</code> not supplied</button>
      <span>
        - cookies now generally default to <code>Lax</code>. But when you do not include <code>SameSite=Lax</code> 
        explicitly then some browers will allow these cookies to be used cross-site for up to 2 minutes. See 
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax">MDN <code>Lax</code></a>
        docs.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=none">
      <button type="submit">Log in - <code>SameSite=None</code></button>
      <span>- <code>None</code> means cookies will be sent on any requests, including cross-site.</span>
    </form>
    <form method="POST" action="/login?sameSite=lax">
      <button type="submit">Log in - <code>SameSite=Lax</code></button>
      <span>- 
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax"><code>Lax</code></a> 
        means cookies will only be sent on cross-site requests in some situations.
      </span>
    </form>
    <form method="POST" action="/login?sameSite=strict">
      <button type="submit">Log in - <code>SameSite=Strict</code></button>
      <span>- <code>Strict</code> means cookies will only ever be sent on same-site requests.</span>
    </form>
    <form method="POST" action="/logout">
      <button type="submit">Log out</button>
    </form>
  </div>
  
  <h2>Authenticated endpoint</h2>
  <code>POST, application/x-www-form-urlencoded, top-level navigation</code>
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
 
  
  <h2>Authenticated endpoint</h2>
  <code>POST, application/json, fetch</code>
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
  <p>
    This uses a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#simple_requests">non-simple</a> 
    <code>Content-Type</code> so a cross-origin request requires a CORS pre-flight.
  </p>
  <div>Result: <span class="transfer-json-result"></span></div>

  <script>
    const button = document.getElementById("send-transfer");
    const toInput = document.getElementById("transfer-json-to");
    const amountInput = document.getElementById("transfer-json-amount");
    button.addEventListener("click", async () => {
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

  // Authenticated with cookie, POST, application/x-www-form-urlencoded
  if (request.method === "POST" && url.pathname === "/transfer") {
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

  // Authenticated with cookie, POST, application/json
  if (request.method === "POST" && url.pathname === "/transfer-json") {
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
