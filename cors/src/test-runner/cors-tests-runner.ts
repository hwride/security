import * as path from "node:path";

import { testRequests } from "../chromium-request-tester/chromium-request-tester.ts";
import { setupLogging } from "../framework/logging.ts";
import {
  setupMainServers,
  shutdownMainServers,
} from "../servers/servers-main.ts";
import { testDefinitions } from "../test-definitions.ts";
import type { CorsConfig, TestDefinition } from "../types.ts";

export async function runCORSTests(config: CorsConfig): Promise<void> {
  // Setup.
  setupLogging(config.log);
  const mainServers = setupMainServers(
    config.ports.server1,
    config.ports.server2,
  );

  try {
    // Make requests.
    const server1URL = `http://localhost:${config.ports.server1}`;
    const server2URL = `http://localhost:${config.ports.server2}`;

    await testRequests({
      puppeteerConfig: config.puppeteer,
      proxyPort: config.ports.proxy,
      mainPageURL: server1URL,
      testDefinitions: getTestDefinitions(
        testDefinitions,
        server1URL,
        server2URL,
      ),
      resultsPath: path.resolve(config.resultsPath),
    });
  } finally {
    // Teardown.
    shutdownMainServers(mainServers);
  }
}

function getTestDefinitions(
  definitions: TestDefinition[],
  server1URL: string,
  server2URL: string,
): TestDefinition[] {
  return definitions.map((testDef) => ({
    ...testDef,
    url: testDef.url
      .replace("${server1}", server1URL)
      .replace("${server2}", server2URL),
  }));
}
