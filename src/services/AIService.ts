/**
 * AI Service
 *
 * This service handles all AI-related functionality including response generation,
 * following functional programming principles with pure functions and proper
 * error handling for AI interactions.
 */

import { LIL_NOUNS_CONFIG, SYSTEM_PROMPT } from '../config/constants';
import type {
  Env,
  AIResponse,
  AIRequestConfig,
  AIGatewayConfig,
  Message
} from '../types';

/**
 * Creates AI request configuration for a given message
 * Pure function that builds the AI request structure
 *
 * @param messageContent - The user message content to respond to
 * @returns AI request configuration object
 */
export function createAIRequestConfig(messageContent: string): AIRequestConfig {
  return {
    max_tokens: LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: messageContent,
      },
    ],
  };
}

/**
 * Creates AI gateway configuration for caching and performance
 * Pure function that builds the gateway configuration
 *
 * @returns AI gateway configuration object
 */
export function createAIGatewayConfig(): AIGatewayConfig {
  return {
    gateway: {
      id: 'default',
      skipCache: LIL_NOUNS_CONFIG.CACHE.SKIP_CACHE,
      cacheTtl: LIL_NOUNS_CONFIG.CACHE.TTL,
    },
  };
}

/**
 * Generates an AI response for a given message
 * Side effect function that calls the Cloudflare AI service
 *
 * @param env - Environment variables containing AI binding
 * @param message - Message to generate response for
 * @returns Promise resolving to AI response
 */
export async function generateAIResponse(
  env: Env,
  message: Message
): Promise<string> {
  try {
    const requestConfig = createAIRequestConfig(message.message);
    const gatewayConfig = createAIGatewayConfig();

    const response: AIResponse = await env.AI.run(
      LIL_NOUNS_CONFIG.AI_MODEL,
      requestConfig,
      gatewayConfig
    );

    return validateAndCleanAIResponse(response.response);
  } catch (error) {
    console.error('AI response generation failed:', error);
    return getFallbackResponse();
  }
}

/**
 * Validates and cleans AI response content
 * Pure function that ensures response quality and safety
 *
 * @param response - Raw AI response string
 * @returns Cleaned and validated response string
 */
export function validateAndCleanAIResponse(response?: string): string {
  if (!response || typeof response !== 'string') {
    return getFallbackResponse();
  }

  // Clean the response
  const cleaned = response
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 280); // Limit length for social media compatibility

  // Validate response isn't empty after cleaning
  if (!cleaned) {
    return getFallbackResponse();
  }

  // Check if response exceeds word limit
  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount > LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_WORDS) {
    // Truncate to word limit
    const words = cleaned.split(/\s+/).slice(0, LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_WORDS);
    return words.join(' ') + (words.length === LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_WORDS ? '...' : '');
  }

  return cleaned;
}

/**
 * Provides a fallback response when AI generation fails
 * Pure function that returns a safe default response
 *
 * @returns Default fallback response string
 */
export function getFallbackResponse(): string {
  return "I'm having trouble generating a response right now. Please try again!";
}

/**
 * Checks if a message content is appropriate for AI processing
 * Pure function that validates message content before AI processing
 *
 * @param messageContent - Message content to validate
 * @returns True if content is appropriate for AI processing
 */
export function isAppropriateForAI(messageContent: string): boolean {
  if (!messageContent || typeof messageContent !== 'string') {
    return false;
  }

  const trimmed = messageContent.trim();

  // Check minimum length
  if (trimmed.length < 1) {
    return false;
  }

  // Check maximum length
  if (trimmed.length > 1000) {
    return false;
  }

  // Basic content filtering - could be expanded
  const inappropriatePatterns = [
    /^\s*$/,  // Empty or whitespace only
    /^(.)\1{10,}$/,  // Repeated characters (spam)
  ];

  return !inappropriatePatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Estimates the cost of an AI request based on token usage
 * Pure function for cost estimation and monitoring
 *
 * @param messageContent - Message content to estimate cost for
 * @returns Estimated token count for the request
 */
export function estimateTokenUsage(messageContent: string): number {
  // Rough estimation: ~4 characters per token
  const systemPromptTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
  const messageTokens = Math.ceil(messageContent.length / 4);
  const maxResponseTokens = LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS;

  return systemPromptTokens + messageTokens + maxResponseTokens;
}
