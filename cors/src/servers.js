const { setupMainServers, shutdownMainServers } = require('./servers-main')
const { setupProxyServers, shutdownProxyServers } = require('./servers-proxy')

exports.setupServers = function({
    server1MainPort,
    server2MainPort,
    server1ProxyPort,
    server2ProxyPort
}) {
    const mainServers = setupMainServers(server1MainPort, server2MainPort)
    const proxyServers = setupProxyServers(server1MainPort, server1ProxyPort,
                                           server2MainPort, server2ProxyPort)
    return { mainServers, proxyServers }
}

exports.shutdownServers = function(servers) {
    shutdownProxyServers(servers.proxyServers)
    shutdownMainServers(servers.mainServers)
}