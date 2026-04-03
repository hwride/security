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

### Output
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

This script issues a TLS certificate using a certificate signing request and the certificate authority we generated. You can run this multiple times, to generate new certificates, each signed by the same generated certificate authority. The CLI defaults to a certificate valid for `localhost`.

### CLI behavior
- By default generates a server certificate (EKU contains `serverAuth`) for `localhost` DNS Subject Alternative Name (SAN).
- `--client` generates a client certificate (EKU contains `clientAuth`). 
- All other arguments specify SAN entries for the certificate. Creates DNS or IP entries automatically. These are what modern TLS will use to check if a certificate is valid.

Examples:
- `npm run issue-cert` - Generates a server certificate for DNS SAN `localhost` (default).
- `npm run issue-cert -- localhost` - Generates a server certificate for DNS SAN `localhost`.
- `npm run issue-cert -- localhost api.test` - Generates a server certificate for DNS SANs `localhost` and `api.test`.
- `npm run issue-cert -- 127.0.0.1 ::1` - Generates a server certificate for IP SAN `127.0.0.1` and `::1`.
- `npm run issue-cert -- localhost api.test 127.0.0.1 ::1` - Generates a server certificate for DNS SANs `localhost` and `api.test`, and IP SANs `127.0.0.1` and `::1`.
- `npm run issue-cert -- --client mtls-client.local` - Generates a client certificate for DNS SAN `mtls-client.local`.

### Programmatic behaviour
- When using `issueCertificate(...)` programmatically, the SAN extension is derived from `dnsNames` and
`ipAddresses`. If both arrays are empty, the certificate is issued without SAN entries.
`commonName` is configurable; by default it uses the first DNS SAN, otherwise the first IP SAN,
otherwise `common-name-default`. 
- `extendedKeyUsage` controls the Extended Key Usage written to the
leaf certificate.
- Set `generatePkcs12: true` to also create a `.p12` bundle containing the issued
certificate, private key, and CA certificate.

### Output
Output directory `build-issued-cert` containing:
- `private-key.key`: The private key for the issued certificate.
- `cert.crt`: The issued certificate.
- `cert.p12`: Optional PKCS#12 bundle created when `generatePkcs12` is enabled.
- `cert.csr`: The certificate signing request used to issue the certificate.
- `cert-v3.ext`: Extensions used as part of generating the certificate.

You can use the private key and certificate to boot an HTTPS server.

## Useful OpenSSL commands
- View a certificate's contents: `openssl x509 -in path/to/cert.crt -text -noout`
- View a PKCS#12 bundle's contents: `openssl pkcs12 -in path/to/cert.p12 -info -noout`
