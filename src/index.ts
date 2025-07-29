import { handleUnreadConversations } from '@/handlers/scheduled';
import { createLogger } from '@/lib/logger';

export { FarcasterStreamWebsocket } from '@/services/farcaster-stream';

export default {
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
