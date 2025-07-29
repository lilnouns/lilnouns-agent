import {
  type DirectCastConversation,
  type DirectCastMessage,
  getDirectCastConversation,
  getDirectCastConversationRecentMessages,
  getDirectCastInbox,
} from '@nekofar/warpcast';
import { filter, pipe, sortBy } from 'remeda';
import type { getConfig } from '@/lib/config';
import { createLogger } from '@/lib/logger';

/**
 * Represents the context required for Farcaster API operations.
 * Contains environment variables and application configuration.
 *
 * @property {Env} env - Environment variables and runtime connections
 * @property {ReturnType<typeof getConfig>} config - Application configuration settings
 */
interface FarcasterContext {
  env: Env;
  config: ReturnType<typeof getConfig>;
}

/**
 * Fetches unread conversations for the Lil Nouns bot from Farcaster.
 *
 * @param context - Object containing environment and configuration context
 * @returns An object containing an array of unread DirectCastConversations
 */
export async function fetchLilNounsUnreadConversations(
  context: FarcasterContext
) {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsUnreadConversations',
  });
  logger.debug('Fetching Lil Nouns unread conversations');

  let conversations: DirectCastConversation[] = [];

  // Fetch the inbox
  const { data, error } = await getDirectCastInbox({
    auth: () => config.farcasterAuthToken,
    query: {
      limit: 100, // Fetch up to 100 conversations
      category: 'default',
      filter: 'unread',
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching unread conversations');
    return { conversations };
  }

  // Sort conversations by timestamp (oldest first) to process them in chronological order
  conversations = pipe(
    data?.result?.conversations ?? [],
    sortBy(c => c.lastMessage?.serverTimestamp ?? 0)
  );

  logger.debug(
    { conversationCount: conversations.length },
    'Found unread conversations'
  );

  return { conversations };
}

/**
 * Retrieves recent messages from a specific Farcaster conversation.
 *
 * @param context - Object containing environment and configuration context
 * @param conversationId - The unique identifier of the conversation to fetch messages from
 * @returns An object containing an array of text messages from the conversation
 */
export async function fetchLilNounsConversationMessages(
  context: FarcasterContext,
  conversationId: string
) {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsConversationMessages',
    conversationId,
  });
  logger.debug('Fetching messages for conversation');

  let messages: DirectCastMessage[] = [];

  // Get recent messages from the specified conversation
  const { data, error } = await getDirectCastConversationRecentMessages({
    auth: () => config.farcasterAuthToken,
    query: {
      conversationId,
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching conversation messages');
    return { messages };
  }

  // Filter out non-text messages and sort by timestamp (oldest first)
  // to maintain chronological order for processing
  messages = pipe(
    data?.result?.messages ?? [],
    filter(m => m.type === 'text'), // Only include text messages
    sortBy(m => m.serverTimestamp) // Sort by timestamp ascending
  );

  logger.debug(
    { messageCount: messages.length },
    'Retrieved messages from conversation'
  );
  return { messages };
}

/**
 * Retrieves the list of participants in a specific Farcaster conversation.
 *
 * @param context - Object containing environment and configuration context
 * @param conversationId - The unique identifier of the conversation
 * @returns An object containing an array of participants in the conversation
 */
export async function fetchLilNounsConversationParticipants(
  context: FarcasterContext,
  conversationId: string
) {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'fetchLilNounsConversationParticipants',
    conversationId,
  });
  logger.debug('Fetching participants for conversation');

  // Get the conversation details
  const { data, error } = await getDirectCastConversation({
    auth: () => config.farcasterAuthToken,
    query: {
      conversationId,
    },
  });

  if (error) {
    logger.error({ error }, 'Error fetching conversation participants');
    return { participants: [] };
  }

  // Extract participants from the conversation data, defaulting to an empty array if not found
  const participants = data?.result?.conversation?.participants ?? [];

  logger.debug(
    { participantCount: participants.length },
    'Retrieved conversation participants'
  );

  return { participants };
}

/**
 * Marks a specific Farcaster conversation as read using WebSocket connection.
 * Falls back gracefully if WebSocket operations fail or timeout.
 *
 * @param context - Object containing environment and configuration context
 * @param conversationId - The unique identifier of the conversation to mark as read
 * @param retryAttempt - Current retry attempt (used internally for exponential backoff)
 * @returns An object containing success status and optional error information
 */
export async function markLilNounsConversationAsRead(
  context: FarcasterContext,
  conversationId: string,
  retryAttempt = 0
) {
  const { env, config } = context;

  const logger = createLogger(env).child({
    module: 'farcaster',
    function: 'markLilNounsConversationAsRead',
    conversationId,
    retryAttempt,
  });
  logger.debug('Attempting to mark conversation as read');

  // Validate the Farcaster auth token before attempting WebSocket connection
  const token = config.farcasterAuthToken;
  if (!token) {
    logger.error('Farcaster auth token is missing');
    return { success: false, error: 'Farcaster auth token is required' };
  }

  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  try {
    // Establish WebSocket connection to Farcaster stream API to mark conversation as read
    const success = await Promise.race([
      // Main WebSocket operation
      new Promise<boolean>((resolve, reject) => {
        const ws = new WebSocket('wss://ws.farcaster.xyz/stream');
        let isResolved = false;
        let isAuthenticated = false;
        let connectionEstablished = false;

        const resolveOnce = (value: boolean) => {
          if (!isResolved) {
            isResolved = true;
            ws.close();
            resolve(value);
          }
        };

        const rejectOnce = (error: Error) => {
          if (!isResolved) {
            isResolved = true;
            ws.close();
            reject(error);
          }
        };

        const sendReadMessage = () => {
          try {
            ws.send(
              JSON.stringify({
                messageType: 'direct-cast-read',
                payload: { conversationId },
                data: conversationId,
              })
            );
            logger.debug('Read message sent');

            setTimeout(() => {
              if (!isResolved) {
                logger.debug('Assuming read operation successful after delay');
                resolveOnce(true);
              }
            }, 3000);
          } catch (err) {
            rejectOnce(
              new Error(
                `Failed to send read message: ${err instanceof Error ? err.message : 'Unknown error'}`
              )
            );
          }
        };

        ws.addEventListener('open', () => {
          connectionEstablished = true;
          logger.debug('WebSocket connection opened');

          try {
            // Send authentication with Bearer token
            ws.send(
              JSON.stringify({
                messageType: 'authenticate',
                data: `Bearer ${token}`,
              })
            );
            logger.debug('Authentication message sent');

            // Since auth doesn't respond on success, send a read message after delay
            setTimeout(() => {
              if (!isResolved) {
                isAuthenticated = true;
                logger.debug(
                  'Assuming authentication successful, sending read message'
                );
                sendReadMessage();
              }
            }, 1000); // Small delay to allow auth to process
          } catch (err) {
            rejectOnce(
              new Error(
                `Failed to send authentication: ${err instanceof Error ? err.message : 'Unknown error'}`
              )
            );
          }
        });

        ws.addEventListener('error', event => {
          logger.warn('WebSocket error occurred');
          if (!connectionEstablished) {
            rejectOnce(new Error('Failed to establish WebSocket connection'));
          } else if (isAuthenticated && !isResolved) {
            logger.debug(
              'WebSocket error but authentication succeeded, assuming success'
            );
            resolveOnce(true);
          } else {
            rejectOnce(new Error('WebSocket connection error'));
          }
        });

        ws.addEventListener('close', event => {
          logger.debug(
            { code: event.code, reason: event.reason },
            'WebSocket closed'
          );

          if (!isResolved) {
            if (event.code === 4001) {
              rejectOnce(new Error('Authentication failed: Invalid token'));
            } else if (event.code === 1000 && isAuthenticated) {
              // Normal closure after authentication might indicate success
              logger.debug(
                'Normal closure after authentication, assuming success'
              );
              resolveOnce(true);
            } else {
              rejectOnce(
                new Error(
                  `WebSocket closed: ${event.code} ${event.reason || ''}`
                )
              );
            }
          }
        });
      }),

      // Timeout promise - increased timeout
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('WebSocket operation timeout'));
        }, 15000); // 15 second timeout
      }),
    ]);

    logger.debug('Successfully marked conversation as read');
    return { success };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    logger.warn(
      { error: errorMessage, conversationId, retryAttempt },
      'Failed to mark conversation as read via WebSocket'
    );

    // Retry logic
    if (retryAttempt < maxRetries && errorMessage.includes('timeout')) {
      const delay = baseDelay * 2 ** retryAttempt; // Exponential backoff
      logger.info(
        { delay, nextAttempt: retryAttempt + 1 },
        'Retrying WebSocket operation after delay'
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      return markLilNounsConversationAsRead(
        context,
        conversationId,
        retryAttempt + 1
      );
    }

    // In development mode or if WebSocket fails, we can still continue
    // The conversation will remain unread but the bot functionality continues
    if (config.env === 'development') {
      logger.info('Development mode: WebSocket failure is non-blocking');
      return { success: false, error: errorMessage, nonBlocking: true };
    }

    // In production, log the error but don't fail the entire operation
    logger.error(
      { error: errorMessage, conversationId },
      'WebSocket mark-as-read failed after retries, but continuing conversation processing'
    );

    return {
      success: false,
      error: errorMessage,
      nonBlocking: true, // Indicate this failure shouldn't stop message processing
    };
  }
}
