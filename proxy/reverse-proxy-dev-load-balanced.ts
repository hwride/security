import { boot } from "./reverse-proxy.ts";

boot({
  port: 8080,
  backends: {
    "example.com": {
      servers: [
        { url: "http://localhost:3000" },
        { url: "http://localhost:3001" },
      ],
      loadBalancingPolicy: "random",
    },
    "attacker.com": {
      servers: [{ url: "http://localhost:4000" }],
    },
  },
});
