const http = require('http')
const httpProxy = require('http-proxy')
const logger = require('../framework/logging').createLogger('severs-proxy')

exports.setupProxyServers = function(server1MainPort, server1ProxyPort,
                                     server2MainPort, server2ProxyPort) {
	logger.info('Setting up proxy server 1...')
	const proxyServer1 = createProxy(server1ProxyPort, server1MainPort)

	logger.info('Setting up proxy server 2...')
	const proxyServer2 = createProxy(server2ProxyPort, server2MainPort)

	return { proxyServer1, proxyServer2 }
}

exports.shutdownProxyServers = function({ proxyServer1, proxyServer2 }) {
	logger.info('Shutting down proxy server 1...')
	proxyServer1.nodeHTTPProxy.close()
	logger.info('Shutting down proxy server 2...')
	proxyServer2.nodeHTTPProxy.close()
}

function createProxy(sourcePort, targetPort) {
	const proxyURL = `http://localhost:${sourcePort}`
	const proxyTargetBaseURL = `http://localhost:${targetPort}`

	const nodeHTTPProxy = httpProxy.createProxyServer({ target: proxyTargetBaseURL }).listen(sourcePort)
	logger.info(`Proxy server listening on port ${sourcePort} and forwarding to ${targetPort}`)

	// Event listener utility functions.
	let eventListeners = []
	const on = (evt, cb) => eventListeners.push({ evt, cb })
	// Remove every event listener for the given event, all we need at the moment.
	const off = (evt) => eventListeners = eventListeners.filter(evtL => evtL.evt !== evt)
	const trigger = (triggeredEvt, data) => {
		eventListeners.forEach(({ evt, cb }) => { if(triggeredEvt === evt) cb(data) })
	}

	// Listen for requests.
	nodeHTTPProxy.on('proxyReq', function(proxyReq, req) {
		const requestData = { proxyReq, req, proxyURL, proxyTargetBaseURL }
		let requestBodyData = [];
		req.on('data', chunk => requestBodyData.push(chunk))
		req.on('end', () => {
			requestData.body = Buffer.concat(requestBodyData).toString()
			trigger('request-finished', requestData)
		})
	})

	// Listen for responses.
	nodeHTTPProxy.on('proxyRes', function(proxyRes, req, res) {
		const responseBodyData = [];
		const responseData = { proxyRes, res, proxyURL, proxyTargetBaseURL }
		proxyRes.on('data', chunk => responseBodyData.push(chunk))
		proxyRes.on('end', function() {
			responseData.body = Buffer.concat(responseBodyData).toString()
			trigger('response-finished', responseData)
		});
	})

	return {
		nodeHTTPProxy,
		on,
		off
	}
}