import { existsSync } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const buildDirPath = resolve(process.cwd(), "build");
const rootCaCertPath = join(buildDirPath, "certificate-authority", "ca-root.crt");
const loginKeychainPath = join(
  homedir(),
  "Library",
  "Keychains",
  "login.keychain-db",
);

async function main() {
  assertRootCaCertExists(rootCaCertPath);

  if (platform() !== "darwin") {
    console.warn(
      `Skipping macOS keychain installation because platform is ${platform()}.`,
    );
    return;
  }

  console.log(`Installing root CA certificate into keychain: ${loginKeychainPath}`);
  await execFile("security", [
    "add-trusted-cert",
    // -d stores trust settings in the admin domain.
    "-d",
    // -r trustRoot marks the cert as a trusted root certificate.
    "-r",
    "trustRoot",
    // -k chooses the keychain file where the cert will be installed.
    "-k",
    loginKeychainPath,
    // Final positional argument is the certificate file to import.
    rootCaCertPath,
  ]);

  console.log("Root CA certificate installed successfully.");
}

function assertRootCaCertExists(certPath: string) {
  if (existsSync(certPath)) {
    console.log(`Found root CA certificate: ${certPath}`);
    return;
  }

  throw new Error(
    `Root CA certificate not found at ${certPath}. Run generate-certificate-test.ts first to create build output.`,
  );
}

main().catch(handleFatalError);

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
