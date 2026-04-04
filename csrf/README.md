# Cross-Site Request Forgery (CSRF)
Some code for testing CSRF.

## Setup
1. Ensure you have an HTTPS certificate and private key for the server under `proxy-cert/`, and the appropriate certificate authority certificate in the trust store used by your browser. You can generate do all this using the [`certgen`](../https/certgen) tool.
1. Setup test DNS entries to point to the local proxy by adding `hosts.example` to your hosts file.
1. Boot the app server: `npm run dev-app`
1. Boot the attacker server: `npm run dev-attacker`
1. Boot the proxy: `npm run proxy`
2. Make requests to app at `example.com` or attacker at `attacker.com`.