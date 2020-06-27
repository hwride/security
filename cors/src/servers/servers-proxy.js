const EventEmitter = require('events')
const http = require('http')
const httpProxy = require('http-proxy')
const logger = require('../framework/logging').createLogger('severs-proxy')

exports.setupProxyServers = function(proxyPort) {
	logger.info('Setting up proxy server...')
	return createProxy(proxyPort)
}

exports.shutdownProxyServers = function({ nodeHTTPProxy, httpServer }) {
	logger.info('Shutting down proxy server...')
	nodeHTTPProxy.close()
    httpServer.close()
}

function createProxy(sourcePort) {
    const nodeHTTPProxy = httpProxy.createProxyServer({})

	// Event listener utility functions.
	const ee = new EventEmitter({ captureRejections: true })
	// Handle uncaptured promise errors.
	ee[Symbol.for('nodejs.rejection')] = e => logger.error(`Unhandled error occurred: ${e}`)

	// Listen for requests and responses.
	const captureBody = (listenObj) => {
		let data = [];
		return new Promise(resolve => {
			listenObj.on('data', chunk => data.push(chunk))
			listenObj.on('end', () => {
				resolve(Buffer.concat(data).toString())
			})
		})
	}
	nodeHTTPProxy.on('proxyReq', async function(proxyReq, req) {
		const body = await captureBody(req)
		ee.emit('request-finished', { proxyReq, req, body })
	})
	nodeHTTPProxy.on('proxyRes', async function(proxyRes, req, res) {
		const body = await captureBody(proxyRes)
		ee.emit('response-finished', { proxyRes, res, body })
	})

    // Setup HTTP server to intercept requests and forward with the proxy.
    const httpServer = http.createServer((req, res) => {
        const protocol = req.url.match(/(\w+):/)[1]
        const target = `${protocol}://${req.headers.host}`
        nodeHTTPProxy.web(req, res, { target })
    });
    httpServer.listen(sourcePort)
    logger.info(`Proxy server listening on port ${sourcePort}...`)

	return {
		nodeHTTPProxy,
        httpServer,
		on: ee.on.bind(ee),
		off: ee.off.bind(ee)
	}
}