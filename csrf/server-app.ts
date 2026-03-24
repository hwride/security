import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

fastify.get("/", function (request, reply) {
  reply.type("text/html; charset=utf-8").send(`<html>
<head>
  <title>App</title>
</head>
<body>
  <h1>App</h1>
  <ul>
    <li><a href="/text">/text</a></li>
    <li><a href="/json">/json</a></li>
  </ul>
</body>
</html>`);
});

fastify.get("/text", function (request, reply) {
  reply.send("GET text response");
});

fastify.post("/text", function (request, reply) {
  reply.send("POST text response");
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
