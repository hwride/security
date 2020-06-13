const { setupMainServers, shutdownMainServers } = require('./servers-main')
const { setupProxyServers, shutdownProxyServers } = require('./servers-proxy')

exports.setupServers = function({ server1, server2 }) {
    const mainServers = setupMainServers(server1.main, server2.main)
    const proxyServers = setupProxyServers(server1.main, server1.proxy, server2.main, server2.proxy)
    return { mainServers, proxyServers }
}

exports.shutdownServers = function(servers) {
    shutdownProxyServers(servers.proxyServers)
    shutdownMainServers(servers.mainServers)
}