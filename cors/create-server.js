const express = require('express')
const cors = require('cors')
const app = express()

module.exports = function createServer(port) {
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
    app.listen(port, function () {
        console.log(`CORS testing server listening on port ${port}`)
    })

    return app
}