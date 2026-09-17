import { describe, expect, it } from 'vitest';
import { addRunRecord, parseRunRecords, type RunRecord } from './activity';

describe('mobile activity records', () => {
  it('keeps newest runs first and caps the recovery ledger', () => {
    const existing: RunRecord[] = [{ runId: 'old', sessionId: 's1', prompt: 'old', status: 'completed', startedAt: 1 }];
    const result = addRunRecord(existing, { runId: 'new', sessionId: 's2', prompt: 'new', status: 'running', startedAt: 2 }, 2);
    expect(result.map((record) => record.runId)).toEqual(['new', 'old']);
    expect(addRunRecord(result, { runId: 'latest', sessionId: 's3', prompt: 'latest', status: 'queued', startedAt: 3 }, 2).map((record) => record.runId)).toEqual(['latest', 'new']);
  });

  it('drops malformed persisted records instead of breaking the app', () => {
    const parsed = parseRunRecords(JSON.stringify([{ runId: 'ok', sessionId: 's', prompt: 'x', status: 'failed', startedAt: 4 }, { runId: 7 }, { nope: true }]));
    expect(parsed).toEqual([{ runId: 'ok', sessionId: 's', prompt: 'x', status: 'failed', startedAt: 4 }]);
    expect(parseRunRecords('not-json')).toEqual([]);
  });
});
