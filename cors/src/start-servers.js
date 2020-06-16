/*
    Starts the servers used by the tests. Boots them with the proxy ports so the same URLs can be used as the tests use.
 */
const config = require('./config')
require('./servers/servers-main').setupMainServers(config.ports.server1.proxy, config.ports.server2.proxy)