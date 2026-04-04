/*
    Starts the servers used by the tests. Boots them with the proxy ports so the same URLs can be used as the tests use.
 */
import { config } from "./config.ts";
import { setupMainServers } from "./servers/servers-main.ts";

setupMainServers(config.ports.server1, config.ports.server2);
