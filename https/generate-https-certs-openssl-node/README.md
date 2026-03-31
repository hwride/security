## Generate Certificate Authority (CA)
This script generates the CA private key and root certificate.

Output directory: `build-ca` containing `ca-private-key.key` and `ca-root.crt`.

Run:
- `npm run generate-ca`

## Issue TLS Certificate
This script issues a TLS certificate from a CSR using an existing CA.

Output directory: `build-issued-cert` containing `private-key.key`, `cert.csr`, `cert-v3.ext`, and `cert.crt`.

You can use this when booting an HTTPS server.

Run:
- `npm run issue-cert`

## Install Certificate Authority certificate
This script will install the generated CA certificate into the system trust store.
