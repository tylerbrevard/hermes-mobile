// Minimal, dependency-free markdown renderer for chat messages.
// Supports: headings, bold/italic, inline code, fenced code blocks, links,
// unordered/ordered lists, blockquotes, and paragraphs. No HTML passthrough —
// everything is escaped before formatting is applied, so this is XSS-safe
// without needing a sanitizer dependency.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

export function renderMarkdown(source: string): string {
  const lines = source.split('\n');
  const blocks: string[] = [];
  let i = 0;
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length) { blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`); paragraph = []; }
  }
  function flushList() {
    if (list) { const tag = list.ordered ? 'ol' : 'ul'; blocks.push(`<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`); list = null; }
  }

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph(); flushList();
      const lang = fence[1] || '';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(`<pre data-lang="${escapeHtml(lang)}"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1; continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph(); flushList();
      blocks.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      i += 1; continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const text = (unordered ?? ordered)![1];
      if (!list || list.ordered !== isOrdered) { flushList(); list = { ordered: isOrdered, items: [] }; }
      list.items.push(text);
      i += 1; continue;
    }
    if (line.trim() === '') { flushParagraph(); flushList(); i += 1; continue; }
    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph(); flushList();
  return blocks.join('');
}
