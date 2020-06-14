module.exports = {
    resultsPath: '../generated/results.html',
    ports: {
        server1: { proxy: 8080, main: 8090 },
        server2: { proxy: 8081, main: 8091 }
    },
    puppeteer: {
        headless: true
    },
    log: {
        'run-cors-tests': 'INFO',
        'cdp-request-logging': 'INFO'
    }
}