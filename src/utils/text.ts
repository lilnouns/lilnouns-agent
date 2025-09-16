/**
 * Strips Markdown formatting from text, leaving only plain text content.
 *
 * Removes various Markdown elements including images, links, code blocks,
 * emphasis, blockquotes, headings, and other formatting characters while
 * preserving the readable text content.
 *
 * @param {string} text - The Markdown-formatted text to process.
 * @return {string} The plain text with Markdown formatting removed.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)\n?/g, '') // remove images and trailing newline
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // remove links but keep text
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // remove inline code
    .replace(/(^|\s)([*_~]){1,3}(\S.*?\S)([*_~]){1,3}(?=\s|$)/g, '$1$3') // remove emphasis
    .replace(/(^|\n)>{1,3}\s?/g, '$1') // remove blockquotes
    .replace(/^#{1,6}\s+/gm, '') // remove headings
    .replace(/\*\*|__|~~|[*_~]/g, '') // remove remaining md chars
    .replace(/\n{3,}/g, '\n\n') // normalize 3+ newlines to 2 newlines
    .replace(/^\n+/, '') // remove leading newlines
    .trim();
}

/**
 * Splits a direct message into chunks of at most the specified length while attempting
 * to break only at natural phrase or sentence boundaries.
 *
 * @param {string} message - The message text to split into chunks.
 * @param {number} maxLength - Maximum length of each chunk. Defaults to 300 characters.
 * @return {string[]} An array of message chunks ready to be sent sequentially.
 */
export function splitMessage(message: string, maxLength = 300): string[] {
  const normalized = message.replace(/\r\n/g, '\n');
  if (normalized.trim().length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let startIndex = skipLeadingWhitespace(normalized, 0);

  while (startIndex < normalized.length) {
    const naturalEnd = findSplitPosition(normalized, startIndex, maxLength);
    const chunk = normalized.slice(startIndex, naturalEnd).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    startIndex = skipLeadingWhitespace(normalized, naturalEnd);
  }

  return chunks;
}

function skipLeadingWhitespace(text: string, index: number): number {
  let current = index;
  while (current < text.length && /\s/.test(text[current] ?? '')) {
    current += 1;
  }
  return current;
}

function findSplitPosition(
  text: string,
  startIndex: number,
  maxLength: number,
): number {
  const upperBound = Math.min(startIndex + maxLength, text.length);
  if (upperBound === text.length) {
    return text.length;
  }

  const seekers: Array<(index: number) => number | null> = [
    index => seekBoundary(text, startIndex, index, /[\n\r]/),
    index => seekBoundary(text, startIndex, index, /[.!?]/),
    index => seekBoundary(text, startIndex, index, /[;:]/),
    index => seekBoundary(text, startIndex, index, /,/),
    index => seekWhitespace(text, startIndex, index),
  ];

  for (const seek of seekers) {
    const result = seek(upperBound);
    if (result !== null) {
      return result;
    }
  }

  return upperBound;
}

function seekBoundary(
  text: string,
  startIndex: number,
  endIndex: number,
  pattern: RegExp,
): number | null {
  for (let index = endIndex; index > startIndex; index -= 1) {
    const char = text[index - 1];
    if (pattern.test(char)) {
      const nextChar = text[index] ?? '';
      if (!/\s/.test(char) && nextChar !== '' && !/\s/.test(nextChar)) {
        continue;
      }
      if (/\s/.test(char)) {
        return trimTrailingWhitespace(text, startIndex, index - 1);
      }

      return index;
    }
  }

  return null;
}

function seekWhitespace(
  text: string,
  startIndex: number,
  endIndex: number,
): number | null {
  for (let index = endIndex; index > startIndex; index -= 1) {
    const char = text[index - 1];
    if (/\s/.test(char)) {
      return trimTrailingWhitespace(text, startIndex, index - 1);
    }
  }

  return null;
}

function trimTrailingWhitespace(
  text: string,
  startIndex: number,
  index: number,
): number {
  let cursor = index;
  while (cursor > startIndex && /\s/.test(text[cursor] ?? '')) {
    cursor -= 1;
  }
  return cursor + 1;
}
