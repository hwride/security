const https = require('https')
const fs = require('fs')

/* Boot this server and go to https://localhost:8080 */
https.createServer({
    key: fs.readFileSync('private-key.key'),
    cert: fs.readFileSync('signed-cert.crt')
}, function (req, res) {
    res.writeHead(200)
    res.end('HTTPS response')
}).listen(8080)