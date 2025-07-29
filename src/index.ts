import { handleUnreadConversations } from '@/handlers/scheduled';
import { createLogger } from '@/lib/logger';

export { FarcasterStreamWebsocket } from '@/services/farcaster-stream';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = createLogger(env).child({
      module: 'index',
      handler: 'fetch',
      timestamp: new Date().toISOString(),
    });

    logger.info('Fetch request started');

    try {
      // Derive a namespace-stable DO id (e.g. per user or "global")
      const id = env.FARCASTER_STREAM.idFromName('global-stream');
      const stub = env.FARCASTER_STREAM.get(id);

      // This invokes your DO's fetch() method,
      // which calls connect() under the hood
      const res = await stub.fetch(request);
      const responseText = await res.text();

      logger.info('Fetch request completed successfully');
      return new Response(responseText, { status: res.status });
    } catch (error) {
      logger.error({ error }, 'Fetch request failed');
      throw error; // Re-throw to ensure proper error reporting
    }
  },

  // The scheduled handler runs at intervals defined in wrangler.toml triggers
  async scheduled(_event, env, _ctx): Promise<void> {
    const logger = createLogger(env).child({
      module: 'index',
      handler: 'scheduled',
      timestamp: new Date().toISOString(),
    });

    logger.info('Scheduled task started');

    try {
      // Handle unread conversations
      await handleUnreadConversations(env);
      logger.info('Scheduled task completed successfully');
    } catch (error) {
      logger.error({ error }, 'Scheduled task failed');
      throw error; // Re-throw to ensure proper error reporting
    }
  },
} satisfies ExportedHandler<Env>;
