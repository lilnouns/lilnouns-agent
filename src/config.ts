import type { Simplify } from 'type-fest';
import { z } from 'zod';

/**
 * Environment variable validation schema
 * Defines the expected environment variables with their types and transformations
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  FARCASTER_AUTH_TOKEN: z.string().min(1),
  LILNOUNS_SUBGRAPH_URL: z.url(),
  ETHEREUM_RPC_URL: z.url(),
});

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
  farcasterAuthToken: RawEnv['FARCASTER_AUTH_TOKEN'];
  lilNounsSubgraphUrl: RawEnv['LILNOUNS_SUBGRAPH_URL'];
  ethereumRpcUrl: RawEnv['ETHEREUM_RPC_URL'];
  // Agent configuration
  agent: {
    fid: number;
    gatewayId: string;
    cacheTtl: number;
    aiModel: '@hf/nousresearch/hermes-2-pro-mistral-7b';
    maxTokens: number;
    cacheKeys: {
      lastFetch: string;
    };
    defaults: {
      fallbackDate: string;
    };
  };
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
 * console.log(`Running in ${config.env} mode`);
 * ```
 */
export function getConfig(env: Env): Config {
  if (!cachedConfig) {
    try {
      // Parse only the required environment variables, ignore additional ones
      const parsed = envSchema.parse({
        NODE_ENV: env.NODE_ENV,
        FARCASTER_AUTH_TOKEN: env.FARCASTER_AUTH_TOKEN,
        LILNOUNS_SUBGRAPH_URL: env.LILNOUNS_SUBGRAPH_URL,
        ETHEREUM_RPC_URL: env.ETHEREUM_RPC_URL,
      });

      // Transform the parsed data into the configuration object
      cachedConfig = {
        env: parsed.NODE_ENV,
        farcasterAuthToken: parsed.FARCASTER_AUTH_TOKEN,
        lilNounsSubgraphUrl: parsed.LILNOUNS_SUBGRAPH_URL,
        ethereumRpcUrl: parsed.ETHEREUM_RPC_URL,
        agent: {
          fid: 20146, // Farcaster ID for the lilnouns account
          gatewayId: 'lilnouns-agent',
          cacheTtl: 3360, // Cache responses for performance (in seconds)
          aiModel: '@hf/nousresearch/hermes-2-pro-mistral-7b' as const,
          maxTokens: 100,
          cacheKeys: {
            lastFetch: 'conversations:last-fetch',
          },
          defaults: {
            fallbackDate: '1970-01-01T00:00:00.000Z',
          },
        },
      };
    } catch (error) {
      // Enhance error message for better debugging
      if (error instanceof z.ZodError) {
        const errorMessage = error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Environment validation failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  return cachedConfig;
}
