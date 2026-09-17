import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PushStore } from './push';

describe('PushStore', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'push-test-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('starts empty', () => {
    const store = new PushStore(dir);
    expect(store.all()).toEqual([]);
  });

  it('adds and persists a subscription', () => {
    const store = new PushStore(dir);
    store.add({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, profile: 'default' });
    expect(store.all()).toHaveLength(1);
    const reloaded = new PushStore(dir);
    expect(reloaded.all()).toHaveLength(1);
    expect(reloaded.all()[0].endpoint).toBe('https://push.example/abc');
  });

  it('replaces a subscription with the same endpoint', () => {
    const store = new PushStore(dir);
    store.add({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, profile: 'default' });
    store.add({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p2', auth: 'a2' }, profile: 'other' });
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].profile).toBe('other');
  });

  it('removes a subscription by endpoint', () => {
    const store = new PushStore(dir);
    store.add({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, profile: 'default' });
    store.remove('https://push.example/abc');
    expect(store.all()).toHaveLength(0);
  });
});
