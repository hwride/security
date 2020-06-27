const express = require('express')
const cors = require('cors')
const logger = require('../framework/logging').createLogger('servers-main')

exports.setupMainServers = function(server1Port, server2Port) {
	// Server 1 is be the origin server, it will server the HTML of the main page.
	logger.info('Setting up server 1...')
	const server1 = createServer(server1Port)
	server1.app.use(express.static(__dirname + '/public'))

	// Server 2 is the cross-origin server.
	logger.info('Setting up server 2...')
	const server2 = createServer(server2Port)

	return { server1,  server2 }
}

exports.shutdownMainServers = function({ server1,  server2 }) {
	logger.info('Shutting down server 1...')
	server1.httpServer.close()
	logger.info('Shutting down server 2...')
	server2.httpServer.close()
}

function createServer(port) {
	const app = express()

	// Setup endpoints.
	app.all('/regular-endpoint', function (req, res) {
		logger.info(`:${port} regular-endpoint request received`)
		res.setHeader('Content-Type', 'text/plain')
		res.send(`This is a non CORS response message from ${port}.`)
	})
	app.all('/cors-disabled-endpoint', cors({
		origin: false // Disables CORS
	}), function (req, res) {
		logger.info(`:${port} cors-disabled-endpoint request received`)
		res.setHeader('Content-Type', 'text/plain')
		res.send(`This is a CORS-disabled response message from ${port}.`)
	})
	app.all('/cors-all-allowed-endpoint', cors(), function (req, res) {
		logger.info(`:${port} cors-all-allowed-endpoint request received`)
		res.setHeader('Content-Type', 'text/plain')
		res.send(`This is a CORS-enabled response message from ${port}.`)
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