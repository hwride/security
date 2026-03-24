import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

fastify.get("/", function (request, reply) {
  reply.send({ json: "value" });
});

fastify.get("/text", function (request, reply) {
  reply.send("GET text response");
});

fastify.post("/text", function (request, reply) {
  reply.send("POST text response");
});

fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
