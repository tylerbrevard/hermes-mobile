import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type MobileSkill = { name: string; description: string; category: string; path: string };

function frontmatterValue(source: string, key: string): string {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
}

export function listLocalSkills(root: string): MobileSkill[] {
  const base = join(root, 'skills');
  if (!existsSync(base)) return [];
  const found: MobileSkill[] = [];
  const visit = (directory: string, category = ''): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, category || entry.name);
      else if (entry.isFile() && entry.name === 'SKILL.md') {
        const source = readFileSync(path, 'utf8').slice(0, 12_000);
        found.push({
          name: frontmatterValue(source, 'name') || directory.split('/').pop() || 'unknown',
          description: frontmatterValue(source, 'description'),
          category,
          path: path.slice(root.length + 1),
        });
      }
    }
  };
  visit(base);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
