import { handleUnreadConversations } from './handlers';
import { createLogger } from './logger';

export default {
  // The scheduled handler runs at intervals defined in wrangler.jsonc triggers
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
    }
  },
} satisfies ExportedHandler<Env>;
