/**
 * Unit tests for MessageService
 * Tests pure functions in isolation following functional programming principles
 */

import { describe, expect, it } from 'vitest';
import {
  hasLilNounsMention,
  isReplyToLilNouns,
  isSentByLilNouns,
  isLilNounsRelevantMessage,
  filterLilNounsRelatedMessages,
  isValidMessage,
  sanitizeMessageContent,
} from '../../src/services/MessageService';
import type { Message } from '../../src/types';

// Test data factory functions
const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  messageId: 'test-message-1',
  message: 'Test message content',
  senderFid: 12345,
  serverTimestamp: Date.now(),
  hasMention: false,
  senderContext: { fid: 12345 },
  ...overrides,
});

describe('MessageService', () => {
  describe('hasLilNounsMention', () => {
    it('should return true when message mentions Lil Nouns FID', () => {
      const message = createMockMessage({
        hasMention: true,
        mentions: [{ user: { fid: 20146 } }],
      });

      expect(hasLilNounsMention(message)).toBe(true);
    });

    it('should return false when message has no mentions', () => {
      const message = createMockMessage({
        hasMention: false,
      });

      expect(hasLilNounsMention(message)).toBe(false);
    });

    it('should return false when message mentions other users', () => {
      const message = createMockMessage({
        hasMention: true,
        mentions: [{ user: { fid: 99999 } }],
      });

      expect(hasLilNounsMention(message)).toBe(false);
    });

    it('should return false when mentions array is empty', () => {
      const message = createMockMessage({
        hasMention: true,
        mentions: [],
      });

      expect(hasLilNounsMention(message)).toBe(false);
    });
  });

  describe('isReplyToLilNouns', () => {
    it('should return true when replying to Lil Nouns from different user', () => {
      const message = createMockMessage({
        inReplyTo: { senderFid: 20146 },
        senderContext: { fid: 12345 },
      });

      expect(isReplyToLilNouns(message)).toBe(true);
    });

    it('should return false when replying to other users', () => {
      const message = createMockMessage({
        inReplyTo: { senderFid: 99999 },
        senderContext: { fid: 12345 },
      });

      expect(isReplyToLilNouns(message)).toBe(false);
    });

    it('should return false when Lil Nouns replies to itself', () => {
      const message = createMockMessage({
        inReplyTo: { senderFid: 20146 },
        senderContext: { fid: 20146 },
      });

      expect(isReplyToLilNouns(message)).toBe(false);
    });

    it('should return false when no reply context', () => {
      const message = createMockMessage();

      expect(isReplyToLilNouns(message)).toBe(false);
    });
  });

  describe('isSentByLilNouns', () => {
    it('should return true when message sent by Lil Nouns', () => {
      const message = createMockMessage({
        senderFid: 20146,
      });

      expect(isSentByLilNouns(message)).toBe(true);
    });

    it('should return false when message sent by other user', () => {
      const message = createMockMessage({
        senderFid: 12345,
      });

      expect(isSentByLilNouns(message)).toBe(false);
    });
  });

  describe('isLilNounsRelevantMessage', () => {
    it('should return true for messages mentioning Lil Nouns', () => {
      const message = createMockMessage({
        hasMention: true,
        mentions: [{ user: { fid: 20146 } }],
        senderFid: 12345,
      });

      expect(isLilNounsRelevantMessage(message)).toBe(true);
    });

    it('should return true for replies to Lil Nouns', () => {
      const message = createMockMessage({
        inReplyTo: { senderFid: 20146 },
        senderContext: { fid: 12345 },
        senderFid: 12345,
      });

      expect(isLilNounsRelevantMessage(message)).toBe(true);
    });

    it('should return false for messages sent by Lil Nouns', () => {
      const message = createMockMessage({
        senderFid: 20146,
        hasMention: true,
        mentions: [{ user: { fid: 20146 } }],
      });

      expect(isLilNounsRelevantMessage(message)).toBe(false);
    });

    it('should return false for irrelevant messages', () => {
      const message = createMockMessage({
        senderFid: 12345,
        hasMention: false,
      });

      expect(isLilNounsRelevantMessage(message)).toBe(false);
    });
  });

  describe('filterLilNounsRelatedMessages', () => {
    it('should filter and sort relevant messages', () => {
      const messages = [
        createMockMessage({
          messageId: 'msg-3',
          serverTimestamp: 3000,
          senderFid: 12345,
          hasMention: true,
          mentions: [{ user: { fid: 20146 } }],
        }),
        createMockMessage({
          messageId: 'msg-1',
          serverTimestamp: 1000,
          senderFid: 20146, // Sent by Lil Nouns - should be filtered out
        }),
        createMockMessage({
          messageId: 'msg-2',
          serverTimestamp: 2000,
          senderFid: 12345,
          inReplyTo: { senderFid: 20146 },
          senderContext: { fid: 12345 },
        }),
      ];

      const result = filterLilNounsRelatedMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].messageId).toBe('msg-2'); // Earlier timestamp
      expect(result[1].messageId).toBe('msg-3'); // Later timestamp
    });

    it('should return empty array when no relevant messages', () => {
      const messages = [
        createMockMessage({
          senderFid: 12345,
          hasMention: false,
        }),
        createMockMessage({
          senderFid: 20146, // Sent by Lil Nouns
        }),
      ];

      const result = filterLilNounsRelatedMessages(messages);

      expect(result).toHaveLength(0);
    });
  });

  describe('isValidMessage', () => {
    it('should return true for valid message', () => {
      const message = createMockMessage();

      expect(isValidMessage(message)).toBe(true);
    });

    it('should return false when messageId is missing', () => {
      const message = createMockMessage({
        messageId: '',
      });

      expect(isValidMessage(message)).toBe(false);
    });

    it('should return false when message content is missing', () => {
      const message = createMockMessage({
        message: '',
      });

      expect(isValidMessage(message)).toBe(false);
    });

    it('should return false when senderFid is not a number', () => {
      const message = createMockMessage({
        senderFid: NaN,
      });

      expect(isValidMessage(message)).toBe(false);
    });
  });

  describe('sanitizeMessageContent', () => {
    it('should normalize whitespace', () => {
      const input = 'Hello    world\n\n\ttest';
      const result = sanitizeMessageContent(input);

      expect(result).toBe('Hello world test');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '   Hello world   ';
      const result = sanitizeMessageContent(input);

      expect(result).toBe('Hello world');
    });

    it('should limit message length', () => {
      const input = 'a'.repeat(1500);
      const result = sanitizeMessageContent(input);

      expect(result).toHaveLength(1000);
    });

    it('should handle empty strings', () => {
      const input = '';
      const result = sanitizeMessageContent(input);

      expect(result).toBe('');
    });
  });
});
