import type { getConfig } from '@/lib/config';

/**
 * Provides essential environment and configuration context for conversation handling operations.
 * This interface encapsulates the necessary dependencies for processing messages,
 * interacting with Farcaster API, and managing AI-powered responses.
 *
 * @property {Env} env - The environment object containing runtime configurations and service connections
 * @property {ReturnType<typeof getConfig>} config - Application configuration with agent settings and feature flags
 */
export interface ConversationContext {
  env: Env;
  config: ReturnType<typeof getConfig>;
}
