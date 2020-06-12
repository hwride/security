const express = require('express')
const cors = require('cors')
const logger = require('./logging').createLogger('cdp-request-logging')

exports.setupServers = function() {
    // Server 1 is be the origin server, it will server the HTML of the main page.
    logger.info('Setting up server 1...')
    const server1 = createServer(8080)
    server1.app.use(express.static(__dirname + '/public'))

    // Server 2 is the cross-origin server.
    logger.info('Setting up server 2...')
    const server2 = createServer(8081)

    return {
        server1,
        server2
    }
}

exports.shutdownServers = function(servers) {
    logger.info('Shutting down server 1...')
    servers.server1.httpServer.close()
    logger.info('Shutting down server 2...')
    servers.server2.httpServer.close()
}

function createServer(port) {
    const app = express()

    // Setup endpoints.
    app.get('/regular-endpoint', function (req, res) {
        logger.info('regular-endpoint request received')
        res.setHeader('Content-Type', 'text/plain')
        res.send('This is a non CORS response message.')
    })
    app.get('/cors-disabled-endpoint', cors({
        origin: false // Disables CORS
    }), function (req, res) {
        logger.info('cors-disabled-endpoint request received')
        res.setHeader('Content-Type', 'text/plain')
        res.send('This is a CORS-disabled response message.')
    })
    app.get('/cors-all-allowed-endpoint', cors(), function (req, res) {
        logger.info('cors-all-allowed-endpoint request received')
        res.setHeader('Content-Type', 'text/plain')
        res.send('This is a CORS-enabled response message.')
    })

    // Listen.
    const httpServer = app.listen(port, function () {
        logger.info(`CORS testing server listening on port ${port}`)
    })

    return {
        app,
        httpServer
    }
}