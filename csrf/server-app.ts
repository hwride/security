import formbody from "@fastify/formbody";
import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

await fastify.register(formbody);

fastify.get("/", function (request, reply) {
  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>App</title>
</head>
<body>
  <h1>App</h1>
  <ul>
    <li><a href="/transfer-demo">Transfer Demo</a></li>
    <li><a href="/json">/json</a></li>
  </ul>
</body>
</html>`);
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

type TransferBody = {
  to?: string;
  amount?: string;
};
// This is a simple request for Same-Origin Policy purposes - i.e. it doesn't need a pre-flight request.
fastify.post("/transfer", function (request, reply) {
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

fastify.get("/json", function (request, reply) {
  reply.send({ json: "value" });
});

fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
