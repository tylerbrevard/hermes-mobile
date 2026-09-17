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
  const role = firstMatch(soul, /\*\*Role:\*\*\s*(.+)$/m, firstMatch(soul, /\*\*Theme:\*\*\s*(.+)$/m, 'Hermes profile')).split(/\s+\*\*/)[0].trim();
  const model = firstMatch(config, /^\s+default:\s*([^\s#]+)\s*$/m, 'Inherited');
  return { id, name, role, model, active };
}

function readProfile(root: string, id: string, active: boolean): ProfileInfo {
  const home = id === 'default' ? root : join(root, 'profiles', id);
  const soul = existsSync(join(home, 'SOUL.md')) ? readFileSync(join(home, 'SOUL.md'), 'utf8') : '';
  const config = existsSync(join(home, 'config.yaml')) ? readFileSync(join(home, 'config.yaml'), 'utf8') : '';
  return parseProfileMetadata(id, soul, config, active);
}

function envValue(source: string, name: string): string {
  const line = source.split(/\r?\n/).find((candidate) => candidate.trim().startsWith(`${name}=`));
  if (!line) return '';
  const value = line.slice(line.indexOf('=') + 1).trim();
  return value.replace(/^(["'])(.*)\1$/, '$2');
}

export function readProfileApiKey(
  profileId: string,
  fallback: string,
  root = process.env.HERMES_HOME || join(homedir(), '.hermes'),
): string {
  if (profileId === 'default') return fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profileId)) return '';
  const envPath = join(root, 'profiles', profileId, '.env');
  if (!existsSync(envPath)) return '';
  const source = readFileSync(envPath, 'utf8');
  return envValue(source, 'API_SERVER_KEY') || envValue(source, 'HERMES_API_KEY');
}

export function profileHome(
  profileId: string,
  root = process.env.HERMES_HOME || join(homedir(), '.hermes'),
): string | undefined {
  if (profileId === 'default') return root;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profileId)) return undefined;
  const home = join(root, 'profiles', profileId);
  return existsSync(home) ? home : undefined;
}

function servedProfiles(root: string): Set<string> {
  const statePath = join(root, 'gateway_state.json');
  if (!existsSync(statePath)) return new Set(['default']);
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as { served_profiles?: unknown; platforms?: Record<string, { state?: string }> };
    const active = new Set(['default']);
    if (Array.isArray(state.served_profiles)) {
      for (const id of state.served_profiles) if (typeof id === 'string') active.add(id);
    }
    for (const [name, platform] of Object.entries(state.platforms ?? {})) {
      if (name.endsWith(':api_server') && platform?.state === 'connected') active.add(name.slice(0, -':api_server'.length));
    }
    return active;
  } catch {
    return new Set(['default']);
  }
}

export function listProfiles(root = process.env.HERMES_HOME || join(homedir(), '.hermes')): ProfileInfo[] {
  const profilesRoot = join(root, 'profiles');
  const ids = existsSync(profilesRoot)
    ? readdirSync(profilesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const served = servedProfiles(root);
  return ['default', ...ids]
    .filter((id, index, all) => all.indexOf(id) === index)
    .map((id) => readProfile(root, id, served.has(id)))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
