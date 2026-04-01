# Security
![](https://github.com/hwride/security/actions/workflows/security.yml/badge.svg)

Various security testing projects.

1. [Same-Origin Policy (SOP) and Cross-Origin Resource Sharing (CORS)](cors): Scripts for testing SOP and CORS. Uses a customer server, Puppeteer, and a HTTP proxy to capture execute different test scenario automatically and capture the result at different stages in the flow: request sent by browser, request actually sent to server, response sent by the server, response actually seen by the browser, and any console logs. All these part are quite relevant, as depending on the scenario SOP, CORS, or pre-flight requests can block requests being sent or responses being read.
2. [HTTPS certificates and local Node.js HTTPS testing](https)
   1. [certgen](https/certgen): certificate generation utility. Can create root CA, install it to trust store, and sign dev certificates.
   1. [Node TLS and HTTPS testing](https/node): Node scripts and tests using TLS/HTTPS.
   1. [OpenSSL HTTPS certificate generation](https/generate-https-certs-openssl): An OpenSSH shell script to generate the core keys and certificates required for the TLS/HTTPS flow. This was the initial testing that led to the `certgen` tool, which does this and more. 
3. [HTTP proxy experiments](proxy): a small HTTP reverse proxy written in Node.
