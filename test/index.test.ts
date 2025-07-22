import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src';

// Mock the external dependencies
vi.mock('@nekofar/warpcast', () => ({
  getDirectCastInbox: vi.fn(),
  getDirectCastConversationRecentMessages: vi.fn(),
  sendDirectCastMessage: vi.fn(),
}));

// Import the mocked functions for use in tests
import {
  getDirectCastInbox,
  getDirectCastConversationRecentMessages,
  sendDirectCastMessage,
} from '@nekofar/warpcast';

describe('Lil Nouns Agent Worker', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock the Warpcast API calls with empty responses
    vi.mocked(getDirectCastInbox).mockResolvedValue({
      data: { result: { conversations: [] } },
      error: undefined,
      response: new Response(),
    });

    vi.mocked(getDirectCastConversationRecentMessages).mockResolvedValue({
      data: { result: { messages: [] } },
      error: undefined,
      response: new Response(),
    });

    vi.mocked(sendDirectCastMessage).mockResolvedValue({
      data: { success: true },
      error: undefined,
      response: new Response(),
    });
  });

  it('should handle scheduled events without conversations', async () => {
    const controller = createScheduledController({
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    });

    const ctx = createExecutionContext();

    // Test that the scheduled handler runs without throwing
    await expect(
      worker.scheduled(controller, env, ctx)
    ).resolves.toBeUndefined();

    await waitOnExecutionContext(ctx);
  });

  it('should log correct execution messages', async () => {
    // Spy on console methods
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const controller = createScheduledController({
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    });

    const ctx = createExecutionContext();

    await worker.scheduled(controller, env, ctx);

    // Verify that console.log was called with the correct messages
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scheduled handler started at')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Found 0 conversations with unread mentions'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scheduled handler completed successfully at')
    );

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    await waitOnExecutionContext(ctx);
  });

  it('should handle conversations with messages', async () => {
    // Mock a conversation with unread mentions
    vi.mocked(getDirectCastInbox).mockResolvedValue({
      data: {
        result: {
          conversations: [
            {
              conversationId: 'test-conversation-1',
              isGroup: true,
              viewerContext: { unreadMentionsCount: 1 },
            },
          ],
        },
      },
      error: undefined,
      response: new Response(),
    });

    // Mock messages that mention Lil Nouns
    vi.mocked(getDirectCastConversationRecentMessages).mockResolvedValue({
      data: {
        result: {
          messages: [
            {
              messageId: 'test-message-1',
              message: 'Hello @lilnouns, how are you?',
              senderFid: 12345,
              serverTimestamp: Date.now(),
              hasMention: true,
              mentions: [{ user: { fid: 20146 } }],
              senderContext: { fid: 12345 },
            },
          ],
        },
      },
      error: undefined,
      response: new Response(),
    });

    // Mock AI response
    const mockEnv = {
      ...env,
      AI: {
        run: vi.fn().mockResolvedValue({
          response: 'Hello! How can I help with Lil Nouns topics?',
        }),
      },
    };

    const controller = createScheduledController({
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    });

    const ctx = createExecutionContext();

    await worker.scheduled(controller, mockEnv, ctx);

    // Verify that the AI was called
    expect(mockEnv.AI.run).toHaveBeenCalled();

    // Verify that a message was sent
    expect(sendDirectCastMessage).toHaveBeenCalled();

    await waitOnExecutionContext(ctx);
  });
});
