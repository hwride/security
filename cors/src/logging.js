const config = require('./config')
const logLevel = require('loglevel')

// Sets up loggers, initializing level from config if configured.
exports.setupLogging = function() {
    logLevel.setDefaultLevel('INFO')

    Object.entries(config.log).forEach(([loggerName, loggerLevel]) =>
        logLevel.getLogger(loggerName).setLevel(loggerLevel))
}

// Create a wrapper function to change default level to INFO.
exports.createLogger = function(name) {
    const logger = logLevel.getLogger(name)
    logger.setDefaultLevel('INFO')
    return logger
}