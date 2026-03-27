import { boot } from "./reverse-proxy.js";

boot({
  port: 8080,
  backends: {
    "example.com": {
      servers: [{ url: "http://localhost:3000" }, { url: "http://localhost:3001" }],
      policy: "random",
    },
    "attacker.com": {
      servers: [{ url: "http://localhost:4000" }],
    },
  },
});
