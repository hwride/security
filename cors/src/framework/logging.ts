import chalk from "chalk";
import loglevel, { type LogLevelDesc, type Logger } from "loglevel";
import prefix from "loglevel-plugin-prefix";

export const logColours = {
  TRACE: chalk.magenta,
  DEBUG: chalk.cyan,
  INFO: chalk.blue,
  WARN: chalk.yellow,
  ERROR: chalk.red,
};

// Setup prefix plugin.
prefix.reg(loglevel);
// Apply prefix to root logger so all other loggers inherit.
prefix.apply(loglevel, {
  format(level, name, timestamp) {
    return `${chalk.gray(`[${timestamp}]`)} ${logColours[level.toUpperCase() as keyof typeof logColours](`${level} [${name}]`)}`;
  },
});

// Sets up loggers, initializing level from config if configured.
export function setupLogging(config: Record<string, LogLevelDesc>): void {
  Object.entries(config).forEach(([loggerName, loggerLevel]) => {
    loglevel.getLogger(loggerName).setLevel(loggerLevel);
  });
}

// Create a wrapper function to change default level to INFO.
export function createLogger(name: string): Logger {
  const logger = loglevel.getLogger(name);
  logger.setDefaultLevel("INFO");
  return logger;
}
