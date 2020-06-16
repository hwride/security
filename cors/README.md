![](https://github.com/hwride/security/workflows/CORS/badge.svg)

# View test results
See [here](https://hwride.github.io/security/cors/generated/results.html)

# How to run tests
`node run-cors-tests.js`

This will boot up some servers then make test requests using Puppeteer. Request data sent to and from the server is 
captured using a transparent proxy. Result data is logged `generated/results.html`.

# How to startup servers for manual testing
This will boot up the two servers used by the tests. You can then use these for manual testing.

1. `node start-servers.js`
1. Go to http://localhost:8080 to load the main page.
1. Make requests to http://localhost:8080 or http://localhost:8081. See the source for URL details.