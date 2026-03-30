import { existsSync } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const buildDirPath = resolve(process.cwd(), "build");
const rootCaCertPath = join(
  buildDirPath,
  "certificate-authority",
  "ca-root.crt",
);
const loginKeychainPath = join(
  homedir(),
  "Library",
  "Keychains",
  "login.keychain-db",
);

async function main() {
  if (platform() !== "darwin") {
    throw new Error(
      `install-root-ca-cert.ts only supports macOS (darwin). Current platform is ${platform()}.`,
    );
  }

  if (!existsSync(rootCaCertPath)) {
    throw new Error(
      `Root CA certificate not found at ${rootCaCertPath}. Run generate-certificate-test.ts first to create build output.`,
    );
  }

  console.log(
    `Installing root CA certificate into login keychain: ${loginKeychainPath}`,
  );
  const { stdout, stderr } = await execFile("security", [
    "add-trusted-cert",
    // -r trustRoot marks the cert as a trusted root certificate.
    "-r",
    "trustRoot",
    // -k chooses the keychain file where the cert will be installed.
    "-k",
    loginKeychainPath,
    // Final positional argument is the certificate file to import.
    rootCaCertPath,
  ]);

  if (stdout) {
    console.log(stdout);
  }
  if (stderr) {
    console.error(stderr);
  }

  console.log("Root CA certificate installed successfully.");
}

main().catch(handleFatalError);

function handleFatalError(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
