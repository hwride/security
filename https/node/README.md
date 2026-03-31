# Node HTTPS
## Run the test server
1. Run `npm run generate-certs` to generate CA and server test certificates.
1. Run `npm run install-root-ca` to install the test root CA certificate into the trust store.
1. Run `npm run uninstall-root-ca` to remove the test root CA certificate from the trust store.
1. Run `npm run start` to boot the test HTTPS server.
1. Load https://localhost:8080 in the browser and see a valid HTTPS connection.
