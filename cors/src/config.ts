import { fileURLToPath } from "node:url";

import type { CorsConfig } from "./types.ts";

export const config: CorsConfig = {
  resultsPath: fileURLToPath(
    new URL("../generated/results.html", import.meta.url),
  ),
  ports: {
    server1: 8080,
    server2: 8081,
    proxy: 9000,
  },
  puppeteer: {
    headless: true,
  },
  log: {
    "run-cors-tests": "INFO",
    "servers-main": "INFO",
  },
};
