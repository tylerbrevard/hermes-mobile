import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listProfiles, parseProfileMetadata, profileHome, readProfileApiKey } from './profiles.js';

describe('profile metadata', () => {
  it('extracts the bot identity without exposing profile contents', () => {
    const profile = parseProfileMetadata('digg', '# SOUL.md — Digg\n**Role:** Research specialist.', 'model:\n  default: MiniMax', false);
    expect(profile).toEqual({ id: 'digg', name: 'Digg', role: 'Research specialist.', model: 'MiniMax', active: false });
  });

  it('reads a named profile API key only from its own profile home', () => {
    const root = mkdtempSync(join(tmpdir(), 'hermes-mobile-'));
    mkdirSync(join(root, 'profiles', 'digg'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'digg', '.env'), 'API_SERVER_KEY="profile-key"\n');
    expect(readProfileApiKey('digg', 'default-key', root)).toBe('profile-key');
    expect(readProfileApiKey('../digg', 'default-key', root)).toBe('');
    expect(profileHome('digg', root)).toBe(join(root, 'profiles', 'digg'));
  });

  it('marks profiles served by the gateway multiplexer as connected', () => {
    const root = mkdtempSync(join(tmpdir(), 'hermes-mobile-'));
    mkdirSync(join(root, 'profiles', 'digg'), { recursive: true });
    writeFileSync(join(root, 'gateway_state.json'), JSON.stringify({ served_profiles: ['digg'] }));
    expect(listProfiles(root).find((profile) => profile.id === 'digg')?.active).toBe(true);
  });
});
