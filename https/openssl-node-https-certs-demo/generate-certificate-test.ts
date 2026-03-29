import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { openssl } from "../openssl-node/openssl-node.ts";
import { join, resolve } from "node:path";

const buildDir = resolve(process.cwd(), "build");
const caDirPath = join(buildDir, "certificate-authority");
const caPrivateKeyPath = join(caDirPath, "private-key.key");

async function main() {
  // Cleanup previous runs.
  if (existsSync(buildDir)) {
    console.warn("Existing build directory detected, removing...");
    await rm(buildDir, { recursive: true, force: true });
  }

  // Prepare directories.
  await mkdir(caDirPath, { recursive: true });

  // Setup Certificate Authority.
  console.log("");
  console.log("-- Setting up Certificate Authority (CA) --");
  console.log("Generating CA private key...");
  await openssl("genrsa", ["-out", caPrivateKeyPath, "2048"]);
  console.log(`Created: ${caPrivateKeyPath}`);
}

main().catch(handleFatalError);

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
