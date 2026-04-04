import { createServer, IncomingMessage, ServerResponse } from "node:http";

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

server.listen(4000, () => {
  console.log("Server listening on http://localhost:4000");
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
  <title>Attacker</title>
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
    form, pre, ul {
        margin: 0;
        padding: 0;
    }
    ul {
        padding-inline: 12px;
    }
    .example {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
  </style>
</head>
<body>
  <h1>Attacker</h1>

  <h2>CSRF attempts on example.com</h2>

  <div class="example">
    <h3>Standard HTML POST form - top-level navigation + unsafe HTTP method</h3>
    <pre>
POST https://example.com/transfer
Content-Type: application/x-www-form-urlencoded
Request type: top-level navigation</pre>
    <form method="POST" action="https://example.com/transfer">
      <label>
        To
        <input type="text" name="to" value="mallory" />
      </label>
      <label>
        Amount
        <input type="text" name="amount" value="1000" />
      </label>
      <button type="submit">Send money</button>
    </form>
    <ul>
      <li>This is not vulnerable to CSRF with explicitly set <code>Lax</code> cookies.</li>
      <li>
        This is vulnerable to CSRF for 2 minutes after a cookie that does not explicitly set <code>Lax</code> on 
        cookies, due to the 2 minute rule (see 
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax">MDN <code>Lax</code></a>
        docs).
      </li>
    </ul>
  </div>

  <div class="example">
    <h3>Standard HTML GET form - top-level navigation + safe HTTP method</h3>
    <pre>
GET https://example.com/transfer-get?to=mallory&amount=1000
Content-Type: none
Request type: top-level navigation</pre>
    <form method="GET" action="https://example.com/transfer-get">
      <label>
        To
        <input type="text" name="to" value="mallory" />
      </label>
      <label>
        Amount
        <input type="text" name="amount" value="1000" />
      </label>
      <button type="submit">Send money</button>
    </form>
    <p class="eg-desc">
      This is vulnerable to CSRF even with <code>SameSite=Lax</code> cookies, because it uses a top-level navigation
      and a safe HTTP method. Attackers can also automate this form submission with JavaScript.
    </p>
  </div>

  <div class="example">
    <h3>POST JSON fetch request - sub-resource request + unsafe HTTP method</h3>
    <pre>
POST https://example.com/transfer-json
Content-Type: application/json
Request type: sub-resource request</pre>
    <div>
      <label>
        To
        <input type="text" id="transfer-json-to" value="mallory" />
      </label>
      <label>
        Amount
        <input type="text" id="transfer-json-amount" value="1000" />
      </label>
      <button type="button" id="send-transfer">Send money</button>
    </div>
    <div>Result: <span class="transfer-json-result"></span></div>
    <p class="eg-desc">
      This uses a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#simple_requests">non-simple</a>
      <code>Content-Type</code> so a cross-origin request requires a CORS pre-flight. So even if cookies would be included
      in the request, it is blocked from being sent by the failed pre-flight <code>OPTIONS</code> request.
    </p>
  </div>

  <script>
    const button = document.getElementById("send-transfer");
    const toInput = document.getElementById("transfer-json-to");
    const amountInput = document.getElementById("transfer-json-amount");
    button.addEventListener("click", async () => {
      document.querySelector('.transfer-json-result').replaceChildren('Loading...')

      try {
        const response = await fetch("https://example.com/transfer-json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ to: toInput.value, amount: amountInput.value }),
        });
        const resultText = await response.text()
        document.querySelector('.transfer-json-result').replaceChildren('code: ' + response.status + ', text: ' + resultText)
      } catch(e) {
        console.error('POST /transfer-json error: ', e)
        document.querySelector('.transfer-json-result').innerHTML = '<span style="color: red">POST /transfer-json error</span>'
      }

    });
  </script>
</body>
</html>`,
    );
    return;
  }

  response.statusCode = 404;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Not Found");
}

function sendHtml(response: ServerResponse, body: string, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(body);
}
