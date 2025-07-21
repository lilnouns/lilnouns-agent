import { describe, expect, it, vi } from 'vitest';
import worker from './index';

describe('Lil Nouns Agent Worker', () => {
  it('should handle scheduled events', async () => {
    // Mock the scheduled controller
    const controller = {
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    } as ScheduledController;

    // Mock environment
    const env = {} as Env;

    // Mock execution context
    const ctx = {
      waitUntil: (promise: Promise<any>) => promise,
      passThroughOnException: () => {},
    } as ExecutionContext;

    // Test that the scheduled handler runs without throwing
    await expect(
      worker.scheduled(controller, env, ctx)
    ).resolves.toBeUndefined();
  });

  it('should log execution time', async () => {
    // Spy on console.log
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const controller = {
      scheduledTime: Date.now(),
      cron: '0 0 * * *',
      noRetry: () => {},
    } as ScheduledController;

    const env = {} as Env;
    const ctx = {
      waitUntil: (promise: Promise<any>) => promise,
      passThroughOnException: () => {},
    } as ExecutionContext;

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
  });
});
