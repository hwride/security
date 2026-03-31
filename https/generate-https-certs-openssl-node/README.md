## Generate Certificate Authority (CA)
This script generates the CA private key and root certificate.

Output directory: `build-ca`.

Run:
- `npm run generate-ca`

## Generate Server HTTPS Certificates
This script generates server assets from a CSR using an existing CA.

Output directory: `build-server`.

Run:
- `npm run start`

## Install Certificate Authority certificate
This script will install the generated CA certificate into the system trust store.
