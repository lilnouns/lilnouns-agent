import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';

import { describe, expect, it, vi } from 'vitest';
import worker from '../src';

describe('Lil Nouns Agent Worker', () => {
  it('should handle scheduled events', async () => {
    // Mock the scheduled controller
    const controller = createScheduledController({
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    });

    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext();

    // Test that the scheduled handler runs without throwing
    await expect(
      worker.scheduled(controller, env, ctx)
    ).resolves.toBeUndefined();

    await waitOnExecutionContext(ctx);
  });

  it('should log execution time', async () => {
    // Spy on console.log
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const controller = createScheduledController({
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    });

    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext();

    await worker.scheduled(controller, env, ctx);

    // Verify that console.log was called with expected messages
    expect(consoleSpy).toHaveBeenCalledWith(
      'Lil Nouns Agent scheduled task executed at:',
      expect.any(String)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Scheduled task completed successfully'
    );

    consoleSpy.mockRestore();

    await waitOnExecutionContext(ctx);
  });
});
