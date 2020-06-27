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

	// Listen for requests.
	nodeHTTPProxy.on('proxyReq', function(proxyReq, req) {
		const requestData = { proxyReq, req }
		let requestBodyData = [];
		req.on('data', chunk => requestBodyData.push(chunk))
		req.on('end', () => {
			requestData.body = Buffer.concat(requestBodyData).toString()
			ee.emit('request-finished', requestData)
		})
	})

	// Listen for responses.
	nodeHTTPProxy.on('proxyRes', function(proxyRes, req, res) {
		const responseBodyData = [];
		const responseData = { proxyRes, res }
		proxyRes.on('data', chunk => responseBodyData.push(chunk))
		proxyRes.on('end', function() {
			responseData.body = Buffer.concat(responseBodyData).toString()
			ee.emit('response-finished', responseData)
		})
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