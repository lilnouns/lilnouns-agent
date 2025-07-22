/**
 * Unit tests for AIService
 * Tests pure functions in isolation following functional programming principles
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createAIRequestConfig,
  createAIGatewayConfig,
  validateAndCleanAIResponse,
  getFallbackResponse,
  isAppropriateForAI,
  estimateTokenUsage,
} from '../../src/services/AIService';
import { LIL_NOUNS_CONFIG, SYSTEM_PROMPT } from '../../src/config/constants';

describe('AIService', () => {
  describe('createAIRequestConfig', () => {
    it('should create proper AI request configuration', () => {
      const messageContent = 'Hello, how are you?';
      const config = createAIRequestConfig(messageContent);

      expect(config).toEqual({
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
      });
    });

    it('should handle empty message content', () => {
      const messageContent = '';
      const config = createAIRequestConfig(messageContent);

      expect(config.messages[1].content).toBe('');
      expect(config.max_tokens).toBe(LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS);
    });
  });

  describe('createAIGatewayConfig', () => {
    it('should create proper gateway configuration', () => {
      const config = createAIGatewayConfig();

      expect(config).toEqual({
        gateway: {
          id: 'default',
          skipCache: LIL_NOUNS_CONFIG.CACHE.SKIP_CACHE,
          cacheTtl: LIL_NOUNS_CONFIG.CACHE.TTL,
        },
      });
    });
  });

  describe('validateAndCleanAIResponse', () => {
    it('should return cleaned response for valid input', () => {
      const response = '  Hello world!  This is a test.  ';
      const result = validateAndCleanAIResponse(response);

      expect(result).toBe('Hello world! This is a test.');
    });

    it('should normalize whitespace', () => {
      const response = 'Hello    world\n\n\ttest';
      const result = validateAndCleanAIResponse(response);

      expect(result).toBe('Hello world test');
    });

    it('should limit response length to 280 characters', () => {
      const response = 'a'.repeat(300);
      const result = validateAndCleanAIResponse(response);

      expect(result).toHaveLength(280);
    });

    it('should truncate to word limit and add ellipsis', () => {
      const response = 'word '.repeat(60); // 60 words, exceeds MAX_WORDS (50)
      const result = validateAndCleanAIResponse(response);

      // The function truncates to 50 words and adds "..." as a separate operation
      // So the result should be 50 words + "..." appended
      expect(result.endsWith('...')).toBe(true);

      // Remove the "..." to count actual words
      const wordsOnly = result.replace(/\.\.\.$/, '').trim();
      const words = wordsOnly.split(/\s+/);
      expect(words).toHaveLength(50); // Exactly 50 words
    });

    it('should return fallback for undefined response', () => {
      const result = validateAndCleanAIResponse(undefined);

      expect(result).toBe(getFallbackResponse());
    });

    it('should return fallback for null response', () => {
      const result = validateAndCleanAIResponse(null as any);

      expect(result).toBe(getFallbackResponse());
    });

    it('should return fallback for non-string response', () => {
      const result = validateAndCleanAIResponse(123 as any);

      expect(result).toBe(getFallbackResponse());
    });

    it('should return fallback for empty response after cleaning', () => {
      const result = validateAndCleanAIResponse('   \n\t   ');

      expect(result).toBe(getFallbackResponse());
    });
  });

  describe('getFallbackResponse', () => {
    it('should return consistent fallback message', () => {
      const result = getFallbackResponse();

      expect(result).toBe("I'm having trouble generating a response right now. Please try again!");
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('isAppropriateForAI', () => {
    it('should return true for valid message content', () => {
      const content = 'Hello, how can I help with Lil Nouns?';
      const result = isAppropriateForAI(content);

      expect(result).toBe(true);
    });

    it('should return false for undefined content', () => {
      const result = isAppropriateForAI(undefined as any);

      expect(result).toBe(false);
    });

    it('should return false for null content', () => {
      const result = isAppropriateForAI(null as any);

      expect(result).toBe(false);
    });

    it('should return false for non-string content', () => {
      const result = isAppropriateForAI(123 as any);

      expect(result).toBe(false);
    });

    it('should return false for empty content', () => {
      const result = isAppropriateForAI('');

      expect(result).toBe(false);
    });

    it('should return false for whitespace-only content', () => {
      const result = isAppropriateForAI('   \n\t   ');

      expect(result).toBe(false);
    });

    it('should return false for content exceeding length limit', () => {
      const content = 'a'.repeat(1001);
      const result = isAppropriateForAI(content);

      expect(result).toBe(false);
    });

    it('should return false for spam-like repeated characters', () => {
      const content = 'aaaaaaaaaaaaa'; // More than 10 repeated characters
      const result = isAppropriateForAI(content);

      expect(result).toBe(false);
    });

    it('should return true for content at maximum length', () => {
      // Create content that's exactly 1000 characters but doesn't trigger spam detection
      const content = 'This is a valid message with varied content. '.repeat(22) + 'End.'; // ~1000 chars
      const result = isAppropriateForAI(content);

      expect(result).toBe(true);
    });

    it('should return true for content with some repeated characters (not spam)', () => {
      const content = 'Hello world!!!'; // Less than 10 repeated characters
      const result = isAppropriateForAI(content);

      expect(result).toBe(true);
    });
  });

  describe('estimateTokenUsage', () => {
    it('should estimate token usage correctly', () => {
      const messageContent = 'Hello world'; // ~3 tokens
      const result = estimateTokenUsage(messageContent);

      const expectedSystemTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
      const expectedMessageTokens = Math.ceil(messageContent.length / 4);
      const expectedTotal = expectedSystemTokens + expectedMessageTokens + LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS;

      expect(result).toBe(expectedTotal);
    });

    it('should handle empty message content', () => {
      const messageContent = '';
      const result = estimateTokenUsage(messageContent);

      const expectedSystemTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
      const expectedTotal = expectedSystemTokens + 0 + LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS;

      expect(result).toBe(expectedTotal);
    });

    it('should handle long message content', () => {
      const messageContent = 'word '.repeat(100); // ~500 characters
      const result = estimateTokenUsage(messageContent);

      expect(result).toBeGreaterThan(LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS);
      expect(typeof result).toBe('number');
    });

    it('should always include system prompt and max response tokens', () => {
      const messageContent = 'test';
      const result = estimateTokenUsage(messageContent);

      const minExpected = Math.ceil(SYSTEM_PROMPT.length / 4) + LIL_NOUNS_CONFIG.AI_RESPONSE.MAX_TOKENS;
      expect(result).toBeGreaterThanOrEqual(minExpected);
    });
  });
});
