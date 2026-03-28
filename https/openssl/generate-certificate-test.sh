# Script to test generating a certificate signing request and producing a signed certificate.
# Requirements: openssl

# Cleanup
rm server/private-key.key
rm server/server.csr
rm server/signed-cert.crt
rm certificate-authority/private-key.key
rm certificate-authority/ca-root.crt
mkdir -p server
mkdir -p certificate-authority

## Setup Certificate Authority.
# Generate CA private key.
echo 'Generating CA private key...'
openssl genrsa -out certificate-authority/private-key.key 2048
echo ''

# Generate self-signed CA root certificate with explicit CA extensions.
echo 'Generating CA root certificate...'
# basicConstraints: mark this certificate as a CA certificate.
# keyUsage: allow this key to sign certificates and CRLs.
# subjectKeyIdentifier: give the CA key a stable identifier for chain building.
openssl req -x509 -sha256 -nodes -days 365 \
  -key certificate-authority/private-key.key \
  -out certificate-authority/ca-root.crt \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" \
  -subj "/C=UK/ST=London/L=London/O=Test CA Org/OU=IT/CN=test-ca.local"

## Setup Server.
# Generate server private key.
echo ''
echo 'Generating server private key...'
openssl genrsa -out server/private-key.key 2048

## Create and submit Certificate Signing Request.
# Generate CSR using server private key.
echo ''
echo 'Generating certificate signing request...'
openssl req -new \
  -key server/private-key.key \
  -out server/server.csr \
  -subj "/C=UK/ST=London/L=London/O=SSL Test Org/OU=IT/CN=localhost"

echo ''
echo 'CA creating signed certificate from CSR...'
# Have CA produce a certificate from the CSR.
openssl x509 -req \
  -in server/server.csr \
  -CA certificate-authority/ca-root.crt \
  -CAkey certificate-authority/private-key.key \
  -CAcreateserial \
  -out server/signed-cert.crt \
  -days 500 \
  -sha256 \
  -extfile certificate-authority/v3.ext
# -extfile is required to assign Subject Alternative Name which Chrome requires to trust an SSL certificate.

echo ''
echo 'Verifying server certificate against CA certificate...'
openssl verify -x509_strict --CAfile certificate-authority/ca-root.crt server/signed-cert.crt

echo ''
echo 'Commands'
echo '--------'
echo 'Verify signed certificate against CA: openssl verify -x509_strict --CAfile certificate-authority/ca-root.crt server/signed-cert.crt'
echo 'View CA root cert: openssl x509 -in certificate-authority/ca-root.crt -text -noout'
echo 'View CSR: openssl req -text -noout -verify -in server/server.csr'
echo 'View CA signed certificated: openssl x509 -in server/signed-cert.crt -text -noout'
echo ''

echo 'Server public keys'
echo '------------------'
echo 'All these places shared the same server public key.'
echo 'From private key: openssl rsa -in server/private-key.key -pubout'
echo "From CSR: openssl req -in server/server.csr -noout -pubkey"
echo "From CA signed certificated: openssl x509 -in server/signed-cert.crt -noout -pubkey"
echo ''

echo 'CA public keys'
echo '--------------'
echo 'All these places shared the same CA public key.'
echo 'From private key: openssl rsa -in certificate-authority/private-key.key -pubout'
echo 'From CA root certificate: openssl x509 -in certificate-authority/ca-root.crt -noout -pubkey'
