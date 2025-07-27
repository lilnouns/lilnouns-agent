import pino from 'pino';
import { getConfig } from './config';

/**
 * Creates and returns a configured Pino logger instance
 * Uses pino-pretty in development environment for better readability
 *
 * @param env - Environment variables object (typically from Cloudflare Workers)
 * @returns Configured Pino logger instance
 */
export function createLogger(env: Env) {
  const config = getConfig(env);

  // Configure logger options based on environment
  const options = {
    level: config.env === 'production' ? 'info' : 'debug',
    ...(config.env === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  };

  return pino(options);
}
