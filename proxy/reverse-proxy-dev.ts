import { boot } from "./reverse-proxy.ts";

boot({
  port: 8080,
  backendByHostname: {
    "example.com": "localhost:3000",
    "attacker.com": "localhost:4000",
  },
});
