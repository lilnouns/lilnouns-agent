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
