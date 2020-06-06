const express = require('express')
const cors = require('cors')

exports.setupServers = function() {
    // Server 1 is be the origin server, it will server the HTML of the main page.
    console.log('Setting up server 1...')
    const server1 = createServer(8080)
    server1.app.use(express.static('public'))

    // Server 2 is the cross-origin server.
    console.log('Setting up server 2...')
    const server2 = createServer(8081)

    return {
        server1,
        server2
    }
}

exports.shutdownServers = function(servers) {
    console.log('Shutting down server 1...')
    servers.server1.httpServer.close()
    console.log('Shutting down server 2...')
    servers.server2.httpServer.close()
}

function createServer(port) {
    const app = express()

    // Setup a regular and CORS enabled endpoint.
    app.get('/regular-endpoint', function (req, res) {
        console.log('regular-endpoint request received')
        res.json({msg: 'This is a non CORS response message.'})
    })
    app.get('/cors-enabled-endpoint', cors(), function (req, res) {
        console.log('cors-enabled-endpoint request received')
        res.json({msg: 'This is a CORS-enabled response message.'})
    })

    // Listen.
    const httpServer = app.listen(port, function () {
        console.log(`CORS testing server listening on port ${port}`)
    })

    return {
        app,
        httpServer
    }
}