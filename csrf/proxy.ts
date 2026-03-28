import { boot } from "../proxy/reverse-proxy.ts";

boot({
  port: 80,
  backends: {
    "example.com": {
      servers: [{ url: "http://localhost:3000" }],
    },
    "attacker.com": {
      servers: [{ url: "http://localhost:4000" }],
    },
  },
});
