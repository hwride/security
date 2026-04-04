import { config } from "./config.ts";
import { runCORSTests } from "./test-runner/cors-tests-runner.ts";

void runCORSTests(config).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
