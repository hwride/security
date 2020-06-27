const path = require('path')

const { setupMainServers, shutdownMainServers } = require('../servers/servers-main')
const { setupLogging } = require('../framework/logging')
const testRequests = require('../chromium-request-tester/chromium-request-tester')
const testDefinitions = require('../test-definitions')

module.exports = async function runCORSTests(config) {
    // Setup.
    setupLogging(config.log)
    const mainServers = setupMainServers(config.ports.server1, config.ports.server2)

    // Make requests.
    const server1URL = `http://localhost:${config.ports.server1}`
    const server2URL = `http://localhost:${config.ports.server2}`
    await testRequests({
        puppeteerConfig: config.puppeteer,
        proxyPort: config.ports.proxy,
        mainPageURL: server1URL,
        testDefinitions: getTestDefinitions(testDefinitions, server1URL, server2URL),
        resultsPath: path.resolve(config.resultsPath)
    })

    // Teardown.
    shutdownMainServers(mainServers)
}

function getTestDefinitions(testDefinitions, server1URL, server2URL) {
    return testDefinitions.map(testDef => ({
        ...testDef,
        url: testDef.url
          .replace('${server1}', server1URL)
          .replace('${server2}', server2URL)
    }))
}