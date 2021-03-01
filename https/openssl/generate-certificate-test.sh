# Script to test generating a certificate signing request and producing a signed certificate.
# Requirements: openssl

# Cleanup
rm -r server
rm -r certificate-authority
mkdir server
mkdir certificate-authority

## Setup Certificate Authority.
# Generate CA private key.
echo '--- Generating CA private key ---'
openssl genrsa -out certificate-authority/private-key.key 2048
echo ''

# Generate self-signed CA root certificate.
echo '--- Generating CA root certificate ---'
openssl req -x509 -sha256 -nodes -days 365 \
  -key certificate-authority/private-key.key \
  -out certificate-authority/ca-root.crt \
  -subj "/C=UK/ST=London/L=London/O=Test CA Org/OU=IT/CN=test-ca.local"

## Setup Server.
# Generate server private key.
echo ''
echo '--- Generating server private key ---'
openssl genrsa -out server/private-key.key 2048

## Create and submit Certificate Signing Request.
# Generate CSR using server private key.
echo ''
echo '--- Generating certificate signing request ---'
openssl req -new \
  -key server/private-key.key \
  -out server/server.csr \
  -subj "/C=UK/ST=London/L=London/O=SSL Test Org/OU=IT/CN=server.local"

echo ''
echo '--- CA creating signed certificate from CSR ---'
# Have CA produce a certificate from the CSR.
openssl x509 -req \
  -in server/server.csr \
  -CA certificate-authority/ca-root.crt \
  -CAkey certificate-authority/private-key.key \
  -CAcreateserial \
  -out server/signed-cert.crt \
  -days 500 \
  -sha256

echo ''
echo 'Commands'
echo '--------'
echo 'View CA root cert: openssl x509 -in certificate-authority/ca-root.crt -text -noout'
echo 'View CSR: openssl req -text -noout -verify -in server/server.csr'
echo 'View CA signed certificated: openssl x509 -in server/signed-cert.crt -text -noout'
echo ''

echo 'Server public keys'
echo 'From private key: openssl rsa -in server/private-key.key -pubout'
echo "From CSR: openssl req -in server/server.csr -noout -pubkey"
echo "From CA signed certificated: openssl x509 -in server/signed-cert.crt -noout -pubkey"
echo ''

echo 'CA public keys'
echo 'From private key: openssl rsa -in certificate-authority/private-key.key -pubout'
echo 'From CA root certificate: openssl x509 -in certificate-authority/ca-root.crt -noout -pubkey'