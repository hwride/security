# How to run tests
`node run-cors-tests.js`

This will boot up some servers the make test requests using Puppeteer and Chrome DevTools Protocol. Results are logged to the console.

# How to startup servers for manual testing
This will boot up the two servers used by the tests. You can then use these for manual testing.

1. `node start-servers.js`
1. Go to http://localhost:8080 to load the main page.
1. Make requests to http://localhost:8080 or http://localhost:8081. See the source for URL details.