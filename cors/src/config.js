module.exports = {
    resultsPath: __dirname + '/../generated/results.html',
    ports: {
        server1: 8080,
        server2: 8081,
        proxy: 9000
    },
    puppeteer: {
        headless: true
    },
    log: {
        'run-cors-tests': 'INFO',
        'servers-main': 'INFO'
    }
}