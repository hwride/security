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
    table {
        border-collapse: collapse;
    }
    table, th, td {
        border: 1px solid black;
    }
    th, td {
        padding: 4px 8px;
    }
    .yes {
        color: green;
    }
    .no {
        color: red;
    }
    .sometimes {
        color: orange;
    }
  </style>
</head>
<body>
  <h1>Attacker</h1>

  <h2>CSRF attempts on example.com - SameSite testing</h2>

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
    <table>
      <thead>
        <tr>
          <th>SameSite</th>
          <th>Vulnerable to CSRF?</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Not supplied</td>
          <td class="sometimes">Sometimes</td>
          <td>
            Usually treated like Lax, but some browsers allow recently set cookies on cross-site POST requests for about 2 minutes.
          </td>
        </tr>
        <tr>
          <td><code>None; Secure</code></td>
          <td class="yes">Yes</td>
          <td>Cookies are sent on cross-site requests, so this POST form can include the session cookie.</td>
        </tr>
        <tr>
          <td><code>Lax</code></td>
          <td class="no">No</td>
          <td><code>Lax</code> blocks cookies on cross-site POST form submissions.</td>
        </tr>
        <tr>
          <td><code>Strict</code></td>
          <td class="no">No</td>
          <td><code>Strict</code> only sends cookies on same-site requests.</td>
        </tr>
      </tbody>
    </table>
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
    <table>
      <thead>
        <tr>
          <th>SameSite</th>
          <th>Vulnerable to CSRF?</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Not supplied</td>
          <td class="yes">Yes</td>
          <td>Browsers generally treat this like <code>Lax</code>, and <code>Lax</code> allows cookies on cross-site top-level navigations with safe methods like <code>GET</code>.</td>
        </tr>
        <tr>
          <td><code>None; Secure</code></td>
          <td class="yes">Yes</td>
          <td>Cookies are sent on all cross-site requests with <code>None; Secure</code></td>
        </tr>
        <tr>
          <td><code>Lax</code></td>
          <td class="yes">Yes</td>
          <td><code>Lax</code> allows cookies on cross-site top-level navigations that use safe HTTP methods.</td>
        </tr>
        <tr>
          <td><code>Strict</code></td>
          <td class="no">No</td>
          <td><code>Strict</code> only sends cookies on same-site requests.</td>
        </tr>
      </tbody>
    </table>
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
    <table>
      <thead>
        <tr>
          <th>Server CORS</th>
          <th>SameSite</th>
          <th>Vulnerable to CSRF?</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Does not allow cross-origin requests</td>
          <td>Any</td>
          <td class="no">No</td>
          <td>
            This cross-origin JSON fetch is blocked by the browser's Same-Origin Policy via CORS pre-flight before the 
            actual POST is sent, so <code>SameSite</code> never gets a chance to matter here.
          </td>
        </tr>
        <tr>
          <td>Allows credentialed cross-origin requests</td>
          <td>Not supplied</td>
          <td class="no">No</td>
          <td>
            Even during the 2 minute <a href="https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.6.7.2">
                <code>Lax-Allowing-Unsafe</code>
            </a> window, cookies are only sent on top-level navigation requests, not on sub-resource requests.
          </td>
        </tr>
        <tr>
          <td>Allows credentialed cross-origin requests</td>
          <td><code>None; Secure</code></td>
          <td class="sometimes">Sometimes</td>
          <td>
            <code>SameSite=None; Secure</code> makes the cookie eligible for cross-site requests, but this only works if
            the browser also allows third-party cookies. Many browsers or browser settings still block them for
            cross-site sub-resource requests (like <code>fetch</code>), even when they are still allowed on some
            top-level navigation requests. In Chrome you can test this working by going to settings and specifically
            adding <code>attack.com</code> to "Sites allowed to use third-party cookies".
          </td>
        </tr>
        <tr>
          <td>Allows credentialed cross-origin requests</td>
          <td><code>Lax</code></td>
          <td class="no">No</td>
          <td><code>Lax</code> blocks cookies on for non-safe HTTP method (<code>POST</code>), and for sub-resource requests.</td>
        </tr>
        <tr>
          <td>Allows credentialed cross-origin requests</td>
          <td><code>Strict</code></td>
          <td class="no">No</td>
          <td><code>Strict</code> only sends cookies on same-site requests.</td>
        </tr>
      </tbody>
    </table>
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
          // By default credentials (here cookies) are only included with same-origin requests.
          // You need to explicitly say to include them if doing a cross-origin request.
          credentials: "include",
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
