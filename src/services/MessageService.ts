/**
 * Message Service
 *
 * This service handles message processing and filtering logic,
 * following functional programming principles with pure functions
 * and immutable data transformations.
 */

import { filter, pipe, sortBy } from 'remeda';
import { LIL_NOUNS_CONFIG } from '../config/constants';
import type { Message, MessagePredicate } from '../types';

/**
 * Checks if a message mentions the Lil Nouns account
 * Pure function that examines message mentions
 *
 * @param message - Message to check for Lil Nouns mentions
 * @returns True if message mentions Lil Nouns account
 */
export function hasLilNounsMention(message: Message): boolean {
  return (
    message.hasMention &&
    (message.mentions?.some(mention => mention.user.fid === LIL_NOUNS_CONFIG.FID) ?? false)
  );
}

/**
 * Checks if a message is a reply to the Lil Nouns account
 * Pure function that examines reply context
 *
 * @param message - Message to check for reply to Lil Nouns
 * @returns True if message is a reply to Lil Nouns account
 */
export function isReplyToLilNouns(message: Message): boolean {
  return (
    message.inReplyTo?.senderFid === LIL_NOUNS_CONFIG.FID &&
    message.senderContext.fid !== LIL_NOUNS_CONFIG.FID
  );
}

/**
 * Checks if a message was sent by the Lil Nouns account
 * Pure function that examines sender FID
 *
 * @param message - Message to check sender
 * @returns True if message was sent by Lil Nouns account
 */
export function isSentByLilNouns(message: Message): boolean {
  return message.senderFid === LIL_NOUNS_CONFIG.FID;
}

/**
 * Predicate function to filter messages relevant to Lil Nouns
 * Combines mention and reply checks while excluding messages sent by Lil Nouns
 *
 * @param message - Message to evaluate
 * @returns True if message is relevant to Lil Nouns and not sent by Lil Nouns
 */
export const isLilNounsRelevantMessage: MessagePredicate = (message) => {
  // Skip all messages sent BY lilnouns
  if (isSentByLilNouns(message)) {
    return false;
  }

  // Include messages that mention or reply to Lil Nouns
  return hasLilNounsMention(message) || isReplyToLilNouns(message);
};

/**
 * Filters and sorts messages that are relevant to Lil Nouns
 * Pure function that processes an array of messages using functional composition
 *
 * @param messages - Array of messages to filter and sort
 * @returns Filtered and sorted array of Lil Nouns-relevant messages
 */
export function filterLilNounsRelatedMessages(messages: Message[]): Message[] {
  return pipe(
    messages,
    filter(isLilNounsRelevantMessage),
    sortBy(m => m.serverTimestamp)
  );
}

/**
 * Validates that a message has required fields for processing
 * Pure function that checks message structure
 *
 * @param message - Message to validate
 * @returns True if message has all required fields
 */
export function isValidMessage(message: Message): boolean {
  return !!(
    message.messageId &&
    message.message &&
    typeof message.senderFid === 'number' &&
    !Number.isNaN(message.senderFid) &&
    typeof message.serverTimestamp === 'number' &&
    !Number.isNaN(message.serverTimestamp)
  );
}

/**
 * Sanitizes message content by removing potentially harmful content
 * Pure function that cleans message text
 *
 * @param messageText - Raw message text to sanitize
 * @returns Sanitized message text
 */
export function sanitizeMessageContent(messageText: string): string {
  // Basic sanitization - remove excessive whitespace and trim
  return messageText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000); // Limit message length
}
