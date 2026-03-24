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
  <h1>App</h1>
  <form method="POST" action="http://localhost:3000/text">
    <button type="submit">Submit</button>
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
