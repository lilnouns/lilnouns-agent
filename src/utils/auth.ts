/**
 * Authentication and Authorization Utilities
 *
 * This module provides functions for validating authentication tokens
 * and handling authorization checks, following functional programming principles.
 */

import type { Env } from '../types';

/**
 * Validates that a Farcaster auth token is present and properly formatted
 * Pure function that checks token structure without making external calls
 *
 * @param token - The auth token to validate
 * @returns True if token appears to be valid format
 */
export function isValidAuthTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const trimmed = token.trim();

  // Basic format validation - should be non-empty and reasonable length
  if (trimmed.length < 10 || trimmed.length > 500) {
    return false;
  }

  // Should not contain obvious invalid characters
  const invalidPatterns = [
    /^\s*$/,           // Empty or whitespace only
    /[<>'"&]/,         // HTML/script injection characters
    /[\r\n\t]/,        // Control characters
  ];

  return !invalidPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Validates environment variables for required authentication tokens
 * Pure function that checks if all required auth tokens are present
 *
 * @param env - Environment variables to validate
 * @returns Object with validation results and any missing tokens
 */
export function validateAuthEnvironment(env: Env): {
  isValid: boolean;
  missingTokens: string[];
  errors: string[];
} {
  const missingTokens: string[] = [];
  const errors: string[] = [];

  // Check for required Farcaster auth token
  if (!env.FARCASTER_AUTH_TOKEN) {
    missingTokens.push('FARCASTER_AUTH_TOKEN');
  } else if (!isValidAuthTokenFormat(env.FARCASTER_AUTH_TOKEN)) {
    errors.push('FARCASTER_AUTH_TOKEN has invalid format');
  }

  // Check for AI binding (not a token but required for functionality)
  if (!env.AI) {
    missingTokens.push('AI');
  }

  return {
    isValid: missingTokens.length === 0 && errors.length === 0,
    missingTokens,
    errors,
  };
}

/**
 * Creates an auth function for Warpcast API calls with validation
 * Higher-order function that returns a validated auth function
 *
 * @param env - Environment variables containing auth token
 * @returns Function that returns the auth token or throws if invalid
 */
export function createValidatedAuthFunction(env: Env): () => string {
  return () => {
    const validation = validateAuthEnvironment(env);

    if (!validation.isValid) {
      const errorMessage = [
        'Authentication validation failed:',
        ...validation.missingTokens.map(token => `- Missing: ${token}`),
        ...validation.errors.map(error => `- Error: ${error}`),
      ].join('\n');

      throw new Error(errorMessage);
    }

    return env.FARCASTER_AUTH_TOKEN;
  };
}

/**
 * Handles authentication errors with appropriate logging and fallback
 * Pure function that processes auth errors and returns standardized error info
 *
 * @param error - The authentication error that occurred
 * @param context - Additional context about where the error occurred
 * @returns Standardized error information
 */
export function handleAuthError(error: unknown, context: string): {
  message: string;
  shouldRetry: boolean;
  logLevel: 'warn' | 'error';
} {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Determine if this is a temporary or permanent auth failure
  const isTemporaryFailure = errorMessage.includes('network') ||
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('503') ||
                            errorMessage.includes('502');

  return {
    message: `Authentication failed in ${context}: ${errorMessage}`,
    shouldRetry: isTemporaryFailure,
    logLevel: isTemporaryFailure ? 'warn' : 'error',
  };
}

/**
 * Rate limiting check for authentication attempts
 * Simple in-memory rate limiting to prevent auth token abuse
 * Note: In production, this should use external storage like KV
 */
const authAttempts = new Map<string, { count: number; resetTime: number }>();

/**
 * Checks if authentication attempts are within rate limits
 * Stateful function that tracks auth attempts (should be replaced with KV in production)
 *
 * @param identifier - Unique identifier for rate limiting (e.g., IP, user ID)
 * @param maxAttempts - Maximum attempts allowed per time window
 * @param windowMs - Time window in milliseconds
 * @returns True if within rate limits
 */
export function isWithinAuthRateLimit(
  identifier: string,
  maxAttempts: number = 10,
  windowMs: number = 60000 // 1 minute
): boolean {
  const now = Date.now();
  const attempts = authAttempts.get(identifier);

  if (!attempts || now > attempts.resetTime) {
    // Reset or initialize attempts
    authAttempts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (attempts.count >= maxAttempts) {
    return false;
  }

  // Increment attempts
  attempts.count++;
  return true;
}

/**
 * Clears rate limiting data (for testing or manual reset)
 * Side effect function for maintenance
 */
export function clearAuthRateLimit(): void {
  authAttempts.clear();
}
