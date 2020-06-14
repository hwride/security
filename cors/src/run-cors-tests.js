const config = require('./config')
const runCORSTests = require('./test-runner/cors-tests-runner')

runCORSTests(config)