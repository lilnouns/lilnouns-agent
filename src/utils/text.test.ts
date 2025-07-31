import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './text';

describe('stripMarkdown', () => {
  it('should remove images', () => {
    const result = stripMarkdown(
      'This is an image ![alt text](http://example.com/image.png)',
    );
    expect(result).toBe('This is an image');
  });

  it('should remove links but keep the link text', () => {
    const result = stripMarkdown('This is a [link text](http://example.com).');
    expect(result).toBe('This is a link text.');
  });

  it('should remove inline code blocks', () => {
    const result = stripMarkdown('Here is some `inline code`.');
    expect(result).toBe('Here is some inline code.');
  });

  it('should remove emphasis characters from text', () => {
    const result = stripMarkdown(
      'This is *italic*, **bold**, and ~~strikethrough~~.',
    );
    expect(result).toBe('This is italic, bold, and strikethrough.');
  });

  it('should remove blockquotes', () => {
    const result = stripMarkdown('> This is a blockquote.');
    expect(result).toBe('This is a blockquote.');
  });

  it('should remove headings', () => {
    const result = stripMarkdown('# Heading 1\n## Heading 2\n### Heading 3');
    expect(result).toBe('Heading 1\nHeading 2\nHeading 3');
  });

  it('should remove stray markdown characters', () => {
    const result = stripMarkdown('Text with **bold** and _italic_ and `code`.');
    expect(result).toBe('Text with bold and italic and code.');
  });

  it('should handle complex markdown input', () => {
    const input = `
# Title
![Image](http://example.com/image.png)
This is **bold** text with [a link](http://example.com) and \`inline code\`.

> Blockquote here

- **List item 1**
- _List item 2_
- ~~List item 3~~
    `;
    const expectedOutput = `
Title
This is bold text with a link and inline code.

Blockquote here

- List item 1
- List item 2
- List item 3
    `.trim();
    const result = stripMarkdown(input);
    expect(result).toBe(expectedOutput);
  });
});
