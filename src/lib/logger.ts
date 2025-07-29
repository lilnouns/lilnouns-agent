import pino from 'pino';
import { getConfig } from './config';

// Cache the logger instance to avoid recreating it multiple times
let loggerInstance: pino.Logger | null = null;

/**
 * Formats a log object into a human-readable string
 */
function formatLogForConsole(log: any): string {
  const { level, msg, time, ...rest } = log;
  const timestamp = new Date(time).toISOString();
  const levelName = pino.levels.labels[level].toUpperCase();

  // Format the additional data (if any)
  const additionalData = Object.keys(rest).length
    ? ` ${JSON.stringify(rest, null, 2)}`
    : '';

  return `${timestamp} [${levelName}]: ${msg}${additionalData}`;
}

/**
 * Writes formatted log to appropriate console method based on level
 */
function writeFormattedLogToConsole(obj: any, formattedLog: string): void {
  switch (obj.level) {
    case pino.levels.values.error:
      console.error(formattedLog);
      break;
    case pino.levels.values.warn:
      console.warn(formattedLog);
      break;
    case pino.levels.values.info:
      console.info(formattedLog);
      break;
    case pino.levels.values.debug:
      console.debug(formattedLog);
      break;
    default:
      console.log(formattedLog);
  }
}

/**
 * Creates and returns a configured Pino logger instance
 * Uses pino-pretty in development environment for better readability
 *
 * @param env - Environment variables object (typically from Cloudflare Workers)
 * @param options - Optional additional logger configuration
 * @returns Configured Pino logger instance
 */
export function createLogger(env: Env, options: pino.LoggerOptions = {}) {
  if (loggerInstance) return loggerInstance;
  const config = getConfig(env);

  // Base options with sensible defaults
  const baseOptions: pino.LoggerOptions = {
    level: config.logger.level,
    // Add timestamp and service name to all logs
    base: {
      pid: false,
      hostname: false,
      service: 'lilnouns-agent',
    },
    // Add better serializers for common objects
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    ...(config.logger.prettyPrint && {
      browser: {
        asObject: true,
        // Custom write function to format logs readably
        write: obj => {
          const formattedLog = formatLogForConsole(obj);
          writeFormattedLogToConsole(obj, formattedLog);
        },
      },
    }),
  };

  // Merge custom options with base options
  loggerInstance = pino({
    ...baseOptions,
    ...options,
  });

  return loggerInstance;
}

/**
 * Creates a child logger with additional context
 *
 * @param logger - Parent logger instance
 * @param bindings - Additional context to add to all log messages
 * @returns Child logger instance
 */
export function createChildLogger(logger: pino.Logger, bindings: object) {
  return logger.child(bindings);
}
