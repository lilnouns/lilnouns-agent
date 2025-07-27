import { processConversations } from './handlers';

export default {
  // The scheduled handler runs at intervals defined in wrangler.jsonc triggers
  async scheduled(event, env, ctx): Promise<void> {
    console.log(
      `[DEBUG] Lil Nouns Agent scheduled task executed at: ${new Date().toISOString()}`
    );
    try {
      await processConversations(env); // Process all relevant conversations
      console.log(`[DEBUG] Scheduled task completed successfully`);
    } catch (error) {
      console.error(`[ERROR] Scheduled task failed:`, error);
    }
  },
} satisfies ExportedHandler<Env>;
