import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('escapes raw HTML', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
  });
  it('renders bold and inline code', () => {
    const html = renderMarkdown('This is **bold** and `code`.');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });
  it('renders fenced code blocks with language', () => {
    const html = renderMarkdown('```ts\nconst x = 1;\n```');
    expect(html).toContain('data-lang="ts"');
    expect(html).toContain('const x = 1;');
  });
  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });
  it('renders links safely', () => {
    const html = renderMarkdown('[click](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });
});
