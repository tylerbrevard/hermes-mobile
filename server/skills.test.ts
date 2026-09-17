import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listLocalSkills } from './skills.js';

describe('local skill inventory', () => {
  it('extracts safe frontmatter without exposing skill bodies', () => {
    const root = mkdtempSync(join(tmpdir(), 'hermes-mobile-'));
    mkdirSync(join(root, 'skills', 'research', 'deep-search'), { recursive: true });
    writeFileSync(join(root, 'skills', 'research', 'deep-search', 'SKILL.md'), '---\nname: deep-search\ndescription: Search carefully.\n---\nsecret body');
    expect(listLocalSkills(root)).toEqual([{ name: 'deep-search', description: 'Search carefully.', category: 'research', path: 'skills/research/deep-search/SKILL.md' }]);
  });
});
