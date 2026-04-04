import { boot } from "../proxy/reverse-proxy.ts";
import { readFileSync } from "node:fs";

boot({
  port: 443,
  proxyProtocol: "https",
  tls: {
    key: readFileSync("proxy-cert/private-key.key"),
    cert: readFileSync("proxy-cert/cert.crt"),
  },
  backends: {
    "example.com": {
      servers: [{ url: "http://localhost:3000" }],
    },
    "attacker.com": {
      servers: [{ url: "http://localhost:4000" }],
    },
  },
});
