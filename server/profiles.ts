import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ProfileInfo = {
  id: string;
  name: string;
  role: string;
  model: string;
  active: boolean;
};

function firstMatch(source: string, pattern: RegExp, fallback: string): string {
  return source.match(pattern)?.[1]?.trim() || fallback;
}

export function parseProfileMetadata(id: string, soul: string, config: string, active: boolean): ProfileInfo {
  const name = firstMatch(soul, /^#\s*SOUL\.md\s*[—-]\s*(.+)$/m, id);
  const role = firstMatch(soul, /\*\*Role:\*\*\s*(.+)$/m, firstMatch(soul, /\*\*Theme:\*\*\s*(.+)$/m, 'Hermes profile'));
  const model = firstMatch(config, /^\s+default:\s*([^\s#]+)\s*$/m, 'Inherited');
  return { id, name, role, model, active };
}

function readProfile(root: string, id: string, active: boolean): ProfileInfo {
  const home = id === 'default' ? root : join(root, 'profiles', id);
  const soul = existsSync(join(home, 'SOUL.md')) ? readFileSync(join(home, 'SOUL.md'), 'utf8') : '';
  const config = existsSync(join(home, 'config.yaml')) ? readFileSync(join(home, 'config.yaml'), 'utf8') : '';
  return parseProfileMetadata(id, soul, config, active);
}

export function listProfiles(root = process.env.HERMES_HOME || join(homedir(), '.hermes')): ProfileInfo[] {
  const profilesRoot = join(root, 'profiles');
  const ids = existsSync(profilesRoot)
    ? readdirSync(profilesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  return ['default', ...ids]
    .filter((id, index, all) => all.indexOf(id) === index)
    .map((id) => readProfile(root, id, id === 'default'))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
