import type { Simplify } from 'type-fest';
import { z } from 'zod';

/**
 * Environment variable validation schema
 * Defines the expected environment variables with their types and transformations
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production'], {
    message: 'NODE_ENV must be one of: development, staging, production',
  }),
  FARCASTER_AUTH_TOKEN: z
    .string()
    .min(1, 'FARCASTER_AUTH_TOKEN cannot be empty'),
  FARCASTER_API_KEY: z.string().min(1, 'FARCASTER_API_KEY cannot be empty'),
  LILNOUNS_SUBGRAPH_URL: z
    .string()
    .url('LILNOUNS_SUBGRAPH_URL must be a valid URL'),
  ETHEREUM_RPC_URL: z.string().url('ETHEREUM_RPC_URL must be a valid URL'),
});

// Add validation for agent configuration
const agentConfigSchema = z.object({
  fid: z.number().positive('Agent FID must be a positive number'),
  autoRagId: z.string().min(1, 'AutoRAG ID cannot be empty'),
  gatewayId: z.string().min(1, 'Gateway ID cannot be empty'),
  cacheTtl: z.number().positive('Cache TTL must be positive'),
  aiModels: z.object({
    functionCalling: z.literal('@hf/nousresearch/hermes-2-pro-mistral-7b'),
    summarization: z.literal('@cf/facebook/bart-large-cnn'),
    textEmbedding: z.literal('@cf/baai/bge-m3'),
    translation: z.literal('@cf/meta/m2m100-1.2b@cf/meta/m2m100-1.2b'),
  }),
  maxTokens: z.number().positive('Max tokens must be positive'),
  cacheKeys: z.object({
    lastFetch: z.string().min(1),
  }),
  defaults: z.object({
    fallbackDate: z
      .string()
      .datetime('Fallback date must be a valid ISO datetime'),
  }),
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
  farcasterApiKey: RawEnv['FARCASTER_API_KEY'];
  lilNounsSubgraphUrl: RawEnv['LILNOUNS_SUBGRAPH_URL'];
  ethereumRpcUrl: RawEnv['ETHEREUM_RPC_URL'];
  agent: z.infer<typeof agentConfigSchema>;
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
 * @throws {Error} When environment variables don't match the expected schema
 *
 * @example
 * ```typescript
 * const config = getConfig(env);
 * console.log(`Running in ${config.env} mode`);
 * ```
 */
export function getConfig(env: Env): Config {
  if (!cachedConfig) {
    // Use safeParse for better error handling
    const envResult = envSchema.safeParse({
      NODE_ENV: env.NODE_ENV,
      FARCASTER_AUTH_TOKEN: env.FARCASTER_AUTH_TOKEN,
      FARCASTER_API_KEY: env.FARCASTER_API_KEY,
      LILNOUNS_SUBGRAPH_URL: env.LILNOUNS_SUBGRAPH_URL,
      ETHEREUM_RPC_URL: env.ETHEREUM_RPC_URL,
    });

    if (!envResult.success) {
      const errorMessages = envResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n  ');
      throw new Error(`Environment validation failed:\n  ${errorMessages}`);
    }

    const agentConfig = {
      fid: 20146,
      autoRagId: 'lilnouns-agent',
      gatewayId: 'lilnouns-agent',
      cacheTtl: 3360,
      aiModels: {
        functionCalling: '@hf/nousresearch/hermes-2-pro-mistral-7b' as const,
        summarization: '@cf/facebook/bart-large-cnn' as const,
        textEmbedding: '@cf/baai/bge-m3' as const,
        translation: '@cf/meta/m2m100-1.2b@cf/meta/m2m100-1.2b' as const,
      },
      maxTokens: 100,
      cacheKeys: {
        lastFetch: 'conversations:last-fetch',
      },
      defaults: {
        fallbackDate: '1970-01-01T00:00:00.000Z',
      },
    };

    // Validate agent configuration
    const agentResult = agentConfigSchema.safeParse(agentConfig);
    if (!agentResult.success) {
      const errorMessages = agentResult.error.issues
        .map(issue => `agent.${issue.path.join('.')}: ${issue.message}`)
        .join('\n  ');
      throw new Error(
        `Agent configuration validation failed:\n  ${errorMessages}`
      );
    }

    cachedConfig = {
      env: envResult.data.NODE_ENV,
      farcasterAuthToken: envResult.data.FARCASTER_AUTH_TOKEN,
      farcasterApiKey: envResult.data.FARCASTER_API_KEY,
      lilNounsSubgraphUrl: envResult.data.LILNOUNS_SUBGRAPH_URL,
      ethereumRpcUrl: envResult.data.ETHEREUM_RPC_URL,
      agent: agentResult.data,
    };
  }

  return cachedConfig;
}
