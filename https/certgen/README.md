# certgen
This is a TLS certificate generation tool. You can use it to generate TLS certificates you can use for local development 
or testing - not for production.

## Quick start
1. Run `npm run generate-ca` to generate a certificate authority certificate. 
1. Run `npm run install-ca` to install the CA certificate into the system trust store.
1. Run `npm run issue-cert` to issue new certificates. You can run this each time you want a new signed certificate.

## Generate Certificate Authority (CA)
`npm run generate-ca`

This script generates the CA private key and root certificate. Normally you run this once.

Output directory `build-ca` containing:
- `ca-private-key.key`: Private key of the certificate authority. Used to sign issued certificates.
- `ca-root.crt`: Certificate of the certificate authority. You install this in your certificate trust store.
- `ca-root.srl`: OpenSSL bookkeeping file that stores the next serial number used when this CA issues certificates.

## Install Certificate Authority certificate
`npm run install-ca`

This script will install the generated CA certificate into the system trust store. Currently MacOS only.

## Uninstall Certificate Authority certificate
`npm run uninstall-ca`

This script will remove the generated CA certificate from the system trust store. Currently MacOS only.

## Issue TLS Certificate
`npm run issue-cert`

This script issues a TLS certificate from a CSR using the CA we generated. You can run this multiple times, to 
generate new certificates, each signed by the same generated certificate authority.

Output directory `build-issued-cert` containing:
- `private-key.key`: The private key for the issued certificate.
- `cert.crt`: The issued certificate.
- `cert.csr`: The certificate signing request used to issue the certificate.
- `cert-v3.ext`: Extensions used as part of generating the certificate.

You can use the private key and certificate to boot an HTTPS server.
