export type RunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled' | 'stopping' | 'interrupted';

export type RunRecord = {
  runId: string;
  sessionId: string;
  profile?: string;
  prompt: string;
  status: RunStatus;
  startedAt: number;
  updatedAt?: number;
  error?: string;
};

const STATUSES = new Set<RunStatus>(['queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled', 'stopping', 'interrupted']);

export function addRunRecord(records: RunRecord[], record: RunRecord, limit = 40): RunRecord[] {
  return [record, ...records.filter((item) => item.runId !== record.runId)].slice(0, Math.max(1, limit));
}

export function parseRunRecords(raw: string | null): RunRecord[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(isRunRecord).slice(0, 40);
  } catch {
    return [];
  }
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RunRecord>;
  return typeof record.runId === 'string' && typeof record.sessionId === 'string' && typeof record.prompt === 'string'
    && typeof record.startedAt === 'number' && typeof record.status === 'string' && STATUSES.has(record.status as RunStatus);
}
