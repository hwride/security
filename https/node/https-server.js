const https = require('https')
const fs = require('fs')

let server
const serverListening = new Promise(resolve => {
    server = https.createServer({
        key: fs.readFileSync('private-key.key'),
        cert: fs.readFileSync('signed-cert.crt')
    }, function (req, res) {
        res.writeHead(200)
        res.end('HTTPS response')
    }).listen(8080, resolve)
})

exports.server = server
exports.serverListening = serverListening
