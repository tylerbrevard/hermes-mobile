import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import webpush from 'web-push';

export type PushSubscriptionRecord = { endpoint: string; keys: { p256dh: string; auth: string }; profile: string };

/** File-backed push subscription store — one small JSON file, no database needed for a single-user PWA. */
export class PushStore {
  private readonly path: string;
  private subscriptions: PushSubscriptionRecord[] = [];

  constructor(stateDir: string) {
    this.path = join(stateDir, 'push-subscriptions.json');
    if (!existsSync(dirname(this.path))) mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      try { this.subscriptions = JSON.parse(readFileSync(this.path, 'utf8')); } catch { this.subscriptions = []; }
    }
  }

  private persist() { writeFileSync(this.path, JSON.stringify(this.subscriptions, null, 2)); }

  add(record: PushSubscriptionRecord) {
    this.subscriptions = this.subscriptions.filter((item) => item.endpoint !== record.endpoint);
    this.subscriptions.push(record);
    this.persist();
  }

  remove(endpoint: string) {
    this.subscriptions = this.subscriptions.filter((item) => item.endpoint !== endpoint);
    this.persist();
  }

  all(): PushSubscriptionRecord[] { return this.subscriptions; }
}

export function configureWebPush(publicKey: string, privateKey: string, subject: string) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushToAll(store: PushStore, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all(store.all().map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) store.remove(sub.endpoint);
    }
  }));
}
