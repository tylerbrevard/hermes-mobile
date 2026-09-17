import { describe, expect, it } from 'vitest';
import { parseProfileMetadata } from './profiles.js';

describe('profile metadata', () => {
  it('extracts the bot identity without exposing the profile body', () => {
    const profile = parseProfileMetadata('digg', '# SOUL.md — Digg\n\n**Name:** Digg. **Role:** Research & analysis specialist, dispatched by Lily.\n', 'model:\n  default: MiniMax-M2.7-highspeed\n', false);
    expect(profile).toEqual({ id: 'digg', name: 'Digg', role: 'Research & analysis specialist, dispatched by Lily.', model: 'MiniMax-M2.7-highspeed', active: false });
  });

  it('falls back safely for incomplete profiles', () => {
    expect(parseProfileMetadata('newbot', '', '', false)).toEqual({ id: 'newbot', name: 'newbot', role: 'Hermes profile', model: 'Inherited', active: false });
  });
});
