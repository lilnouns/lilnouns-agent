import { describe, expect, it } from 'vitest';
import { stripMarkdown } from '../src/utils/text';

describe('stripMarkdown', () => {
  it('removes bold formatting', () => {
    const input = 'This is **bold** text';
    expect(stripMarkdown(input)).toBe('This is bold text');
  });

  it('removes markdown links', () => {
    const input = 'A [link](https://example.com) here';
    expect(stripMarkdown(input)).toBe('A link here');
  });
});
