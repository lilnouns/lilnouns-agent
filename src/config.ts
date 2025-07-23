import { pick, pipe } from 'remeda';
import type { Simplify } from 'type-fest';
import { z } from 'zod';

/**
 * Environment variable validation schema
 * Defines the expected environment variables with their types and transformations
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production']),
    PORT: z
      .string()
      .transform(Number)
      .pipe(z.number().int().positive())
      .default(3000),
    DATABASE_URL: z.url(),
  })
  .strict();

/**
 * Raw environment type inferred from schema
 */
type RawEnv = z.infer<typeof envSchema>;

/**
 * Application configuration interface
 * Simplified and normalized version of environment variables
 */
export type Config = Simplify<{
  env: RawEnv['NODE_ENV'];
  port: RawEnv['PORT'];
  dbUrl: RawEnv['DATABASE_URL'];
}>;

/**
 * Configuration cache to avoid repeated parsing
 * Improves performance by parsing environment variables only once
 */
let cachedConfig: Config | null = null;

/**
 * Parses and returns application configuration from environment variables
 *
 * @param env - Environment variables object (typically from Cloudflare Workers)
 * @returns Normalized configuration object
 * @throws {z.ZodError} When environment variables don't match the expected schema
 *
 * @example
 * ```typescript
 * const config = getConfig(env);
 * console.log(`Running in ${config.env} mode on port ${config.port}`);
 * ```
 */
export function getConfig(env: Env): Config {
  if (!cachedConfig) {
    try {
      const parsed = envSchema.parse(env);

      // Use remeda's pipe and pick for functional data transformation
      cachedConfig = pipe(
        parsed,
        pick(['NODE_ENV', 'PORT', 'DATABASE_URL']),
        ({ NODE_ENV, PORT, DATABASE_URL }) => ({
          env: NODE_ENV,
          port: PORT,
          dbUrl: DATABASE_URL,
        })
      );
    } catch (error) {
      // Enhance an error message for better debugging
      if (error instanceof z.ZodError) {
        const errorMessage = error.issues
          .map((e: z.core.$ZodIssue) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Environment validation failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  return cachedConfig;
}
