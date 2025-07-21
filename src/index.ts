/**
 * Lil Nouns Agent - Scheduled Worker
 *
 * This worker runs on a scheduled basis to perform automated tasks
 * for the Lil Nouns ecosystem.
 */

export default {
  async fetch(req) {
    const url = new URL(req.url);
    url.pathname = '/__scheduled';
    url.searchParams.append('cron', '* * * * *');
    return new Response(
      `To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`
    );
  },

  async scheduled(event, env, ctx): Promise<void> {
    console.log(
      'Lil Nouns Agent scheduled task executed at:',
      new Date().toISOString()
    );

    // TODO: Add your scheduled task logic here
    // This could include:
    // - Fetching data from APIs
    // - Processing blockchain data
    // - Sending notifications
    // - Updating databases
    // - etc.

    console.log('Scheduled task completed successfully');
  },
} satisfies ExportedHandler<Env>;
