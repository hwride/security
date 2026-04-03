import { openssl } from "../openssl-node/openssl-node.ts";

if (import.meta.main) {
  await main();
}

async function main() {
  const caRootCertPath = process.argv[2];
  const certPath = process.argv[3];

  if (!caRootCertPath || !certPath) {
    console.error(
      "Usage: npm run verify-cert path/to/ca-root.crt path/to/cert.crt",
    );
    process.exitCode = 1;
    return;
  }

  const result = await verifyCertificate(caRootCertPath, certPath);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

export async function verifyCertificate(
  caRootCertPath: string,
  certPath: string,
) {
  return openssl("verify", [
    "-x509_strict",
    "-CAfile",
    caRootCertPath,
    certPath,
  ]);
}
