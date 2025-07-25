export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // remove images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // remove links but keep text
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // remove inline code
    .replace(/(^|\s)([*_~]){1,3}(\S.*?\S)([*_~]){1,3}(?=\s|$)/g, '$1$3') // remove emphasis
    .replace(/(^|\n)>{1,3}\s?/g, '$1') // remove blockquotes
    .replace(/^#{1,6}\s+/gm, '') // remove headings
    .replace(/\*\*|__|~~|[*_~]/g, '') // remove remaining md chars
    .trim();
}
