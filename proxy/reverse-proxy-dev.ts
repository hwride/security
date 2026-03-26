import { boot } from "./reverse-proxy.ts";

boot({
  port: 8080,
  backendByHost: {
    "example.com": "localhost:3000",
    "attacker.com": "localhost:4000",
  },
});
