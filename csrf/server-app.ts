import formbody from "@fastify/formbody";
import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

await fastify.register(formbody);

const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_VALUE = "demo-session";

function hasValidSession(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return false;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  return cookies.includes(`${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`);
}

fastify.get("/", function (request, reply) {
  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>App</title>
</head>
<body>
  <h1>App</h1>
  <form method="POST" action="/login">
    <button type="submit">Log in</button>
  </form>
  <ul>
    <li><a href="/transfer-demo">Transfer Demo</a></li>
    <li><a href="/transfer-json-demo">Transfer JSON Demo</a></li>
    <li><a href="/json">/json</a></li>
  </ul>
</body>
</html>`);
});

fastify.post("/login", function (request, reply) {
  reply
    .header(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`
    )
    .redirect(303, "/");
});

fastify.get("/transfer-demo", function (request, reply) {
  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>Transfer Demo</title>
</head>
<body>
  <h1>Transfer Demo</h1>
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
</body>
</html>`);
});


fastify.get("/transfer-json-demo", function (request, reply) {
  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>Transfer JSON Demo</title>
</head>
<body>
  <h1>Transfer JSON Demo</h1>
  <p>This sends JSON and a custom header, so a cross-origin request requires a CORS pre-flight.</p>
  <button type="button" id="send-transfer">Send money</button>

  <script>
    const button = document.getElementById("send-transfer");
    button.addEventListener("click", async () => {
      const response = await fetch("/transfer-json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Transfer-Intent": "manual",
        },
        body: JSON.stringify({ to: "alice", amount: "100" }),
      });

      document.body.insertAdjacentHTML("beforeend", await response.text());
    });
  </script>
</body>
</html>`);
});

type TransferBody = {
  to?: string;
  amount?: string;
};
// This is a simple request for Same-Origin Policy purposes - i.e. it doesn't need a pre-flight request.
fastify.post("/transfer", function (request, reply) {
  if (!hasValidSession(request.headers.cookie)) {
    reply
      .code(401)
      .header("Content-Type", "text/html; charset=utf-8")
      .send(`<html>
<head>
  <title>Unauthorized</title>
</head>
<body>
  <h1>Unauthorized</h1>
  <p>Please log in first.</p>
</body>
</html>`);
    return;
  }

  const body = request.body as TransferBody;
  const to = body.to ?? "";
  const amount = body.amount ?? "";

  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>Transfer Complete</title>
</head>
<body>
  <h1>Transfer Complete</h1>
  <p>Transferred ${amount} to ${to}.</p>
</body>
</html>`);
});



type TransferJsonBody = {
  to?: string;
  amount?: string;
};

// This is a non-simple request for Same-Origin Policy purposes - JSON and custom headers cause a pre-flight for cross-origin requests.
fastify.post("/transfer-json", function (request, reply) {
  if (!hasValidSession(request.headers.cookie)) {
    reply
      .code(401)
      .header("Content-Type", "text/html; charset=utf-8")
      .send(`<section>
  <h2>Unauthorized</h2>
  <p>Please log in first.</p>
</section>`);
    return;
  }

  const body = request.body as TransferJsonBody;
  const to = body.to ?? "";
  const amount = body.amount ?? "";

  reply.header("Content-Type", "text/html; charset=utf-8").send(`<section>
  <h2>Transfer JSON Complete</h2>
  <p>Transferred ${amount} to ${to}.</p>
</section>`);
});

fastify.get("/json", function (request, reply) {
  reply.send({ json: "value" });
});

fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
