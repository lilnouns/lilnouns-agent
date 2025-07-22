import { forEach } from 'remeda';
import {
  retrieveUnreadMentionsInGroups,
  retrieveConversationMessages,
  sendMessage,
  generateMessageId
} from './services/FarcasterService';
import {
  filterLilNounsRelatedMessages,
  isValidMessage,
  sanitizeMessageContent
} from './services/MessageService';
import {
  generateAIResponse,
  isAppropriateForAI
} from './services/AIService';
import {
  validateAuthEnvironment,
  handleAuthError
} from './utils/auth';
import type { Env, DirectCastMessageRequest } from './types';

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
    try {
      console.log(`Scheduled handler started at ${event.cron}`);

      // Validate authentication environment at startup
      const authValidation = validateAuthEnvironment(env);
      if (!authValidation.isValid) {
        const errorMessage = [
          'Authentication validation failed at startup:',
          ...authValidation.missingTokens.map(token => `- Missing: ${token}`),
          ...authValidation.errors.map(error => `- Error: ${error}`),
        ].join('\n');

        console.error(errorMessage);
        throw new Error('Authentication validation failed - cannot proceed');
      }

      console.log('Authentication validation passed');

      const conversations = await retrieveUnreadMentionsInGroups(env);
      console.log(`Found ${conversations.length} conversations with unread mentions`);

      for (const { conversationId } of conversations) {
        try {
          console.log({ conversationId });

          // Retrieve all messages from the conversation
          const allMessages = await retrieveConversationMessages(env, conversationId);

          // Filter for Lil Nouns-related messages
          const relevantMessages = filterLilNounsRelatedMessages(allMessages);
          console.log(`Found ${relevantMessages.length} relevant messages in conversation ${conversationId}`);

          for (const message of relevantMessages) {
            try {
              // Validate message before processing
              if (!isValidMessage(message)) {
                console.warn(`Skipping invalid message: ${message.messageId}`);
                continue;
              }

              // Check if message content is appropriate for AI processing
              if (!isAppropriateForAI(message.message)) {
                console.warn(`Skipping inappropriate message: ${message.messageId}`);
                continue;
              }

              console.log({
                messageId: message.messageId,
                senderFid: message.senderFid,
                messagePreview: message.message.slice(0, 50) + '...'
              });

              // Generate AI response
              const aiResponse = await generateAIResponse(env, message);

              // Create message request
              const messageRequest: DirectCastMessageRequest = {
                conversationId,
                recipientFids: [message.senderFid],
                messageId: generateMessageId(),
                type: 'text',
                message: aiResponse,
                inReplyToId: message.messageId,
              };

              // Send the response
              const result = await sendMessage(env, messageRequest);
              console.log(`Message sent successfully to conversation ${conversationId}`);

            } catch (messageError) {
              console.error(`Error processing message ${message.messageId}:`, messageError);
              // Continue processing other messages even if one fails
            }
          }
        } catch (conversationError) {
          console.error(`Error processing conversation ${conversationId}:`, conversationError);
          // Continue processing other conversations even if one fails
        }
      }

      console.log(`Scheduled handler completed successfully at ${event.cron}`);
    } catch (error) {
      console.error('Scheduled handler failed:', error);
      // Don't throw - let the worker complete gracefully
    }
  },
} satisfies ExportedHandler<Env>;
