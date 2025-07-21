import {
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
} from '@nekofar/warpcast';
import { filter, forEach, pipe } from 'remeda';

/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your Worker in action
 * - Run `npm run deploy` to publish your Worker
 *
 * Bind resources to your Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.s/workers/
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

  // The scheduled handler is invoked at the interval set in our wrangler.jsonc's
  // [[triggers]] configuration.
  async scheduled(event, env, ctx): Promise<void> {
    const { data, error, response } = await getDirectCastInbox({
      auth: () => env.FARCASTER_AUTH_TOKEN,
    });

    if (response.ok !== true) {
      console.log(error);
      return;
    }

    const conversations = pipe(
      data?.result?.conversations ?? [],
      filter(c => c.isGroup && (c.viewerContext?.unreadMentionsCount ?? 0) > 0)
    );

    forEach(conversations, async ({ conversationId }) => {
      console.log({ conversationId });

      const { data, response, error } =
        await getDirectCastConversationRecentMessages({
          auth: () => env.FARCASTER_AUTH_TOKEN,
          query: {
            conversationId,
          },
        });

      console.log({ data, response, error });

      if (response.ok !== true) {
        return;
      }

      console.log(data?.result?.messages ?? []);
    });

    // You could store this result in KV, write to a D1 Database, or publish to a Queue.
    // In this template, we'll just log the result:
    console.log(`trigger fired at ${event.cron}`);
  },
} satisfies ExportedHandler<Env>;
