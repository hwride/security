# Node HTTPS
## Run a test HTTPS server
Run `npm run test`. Our test file will generate appropriate certificates, boot up an HTTPS server,
then make a valid HTTPS request to that server.

## Run a dev HTTPS server
1. Run `npm run certgen:generate-certs` to generate CA and server test certificates.
1. Run `npm run certgen:install-ca` to install the test root CA certificate into the trust store.
1. Run `npm run start` to boot the test HTTPS server.
1. Load https://localhost:8080 in the browser and see a valid HTTPS connection.
1. Run `npm run certgen:uninstall-ca` to install the test root CA certificate into the trust store.

Note the `certgen` command rely on the fact files are created relative to the current working directory.