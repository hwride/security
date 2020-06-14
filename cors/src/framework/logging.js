const loglevel = require('loglevel')
const chalk = require('chalk')
const prefix = require('loglevel-plugin-prefix')

// Setup prefix plugin.
prefix.reg(loglevel)
// Apply prefix to root logger so all other loggers inherit.
const logColours = exports.logColours = {
    TRACE: chalk.magenta,
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red,
}
prefix.apply(loglevel, {
    format(level, name, timestamp) {
        return `${chalk.gray(`[${timestamp}]`)} ${logColours[level.toUpperCase()](`${level} [${name}]`)}`
    }
})

// Sets up loggers, initializing level from config if configured.
exports.setupLogging = function(config) {
    Object.entries(config).forEach(([loggerName, loggerLevel]) =>
        loglevel.getLogger(loggerName).setLevel(loggerLevel))
}

// Create a wrapper function to change default level to INFO.
exports.createLogger = function(name) {
    const logger = loglevel.getLogger(name)
    logger.setDefaultLevel('INFO')
    return logger
}