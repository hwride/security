const { setupMainServers, shutdownMainServers } = require('./servers-main')
const { setupProxyServers, shutdownProxyServers } = require('./servers-proxy')

exports.setupServers = function({ server1, server2, proxy }) {
    const mainServers = setupMainServers(server1, server2)
    const proxyServer = setupProxyServers(proxy)
    return { mainServers, proxyServer }
}

exports.shutdownServers = function(servers) {
    shutdownProxyServers(servers.proxyServer)
    shutdownMainServers(servers.mainServers)
}