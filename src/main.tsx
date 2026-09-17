import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addRunRecord, parseRunRecords, type RunRecord, type RunStatus } from './activity';
import './styles.css';

type Tab = 'bot' | 'bots' | 'sessions' | 'activity' | 'settings';
type Message = { role: 'user' | 'assistant' | 'system'; content: string };
type SessionSummary = { id: string; title?: string; preview?: string; last_active?: number; message_count?: number; archived?: boolean };
type ProfileInfo = { id: string; name: string; role: string; model: string; active: boolean };

type ApiError = { error?: { code?: string; message?: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as ApiError).error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

function textFromEvent(value: unknown): string {
  if (typeof value === 'string') return value === '[DONE]' ? '' : value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['delta', 'text', 'content', 'output_text', 'message']) {
    const candidate = record[key];
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = textFromEvent(candidate);
      if (nested) return nested;
    }
  }
  return '';
}

type RunEvent = { event?: string; run_id?: string; delta?: string; output?: string; status?: string; approval?: Record<string, unknown>; [key: string]: unknown };

async function streamRun(sessionId: string, message: string, onEvent: (event: RunEvent) => void): Promise<string> {
  const admitted = await api<{ run_id: string }>('/api/runs', { method: 'POST', body: JSON.stringify({ input: message, session_id: sessionId }) });
  onEvent({ event: 'run.queued', run_id: admitted.run_id, status: 'queued' });
  const response = await fetch(`/api/runs/${encodeURIComponent(admitted.run_id)}/events`, { credentials: 'include' });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({})) as ApiError;
    throw new Error(body.error?.message ?? `Run stream failed (${response.status})`);
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split('\n\n'); buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim(); if (!data) continue;
      try { const event = JSON.parse(data) as RunEvent; onEvent(event); } catch { /* Ignore non-JSON keepalive frames. */ }
    }
    if (done) break;
  }
  return admitted.run_id;
}

async function runControl(runId: string, action: 'stop' | 'steer' | 'approval', body: Record<string, unknown> = {}) {
  return api(`/api/runs/${encodeURIComponent(runId)}/${action}`, { method: 'POST', body: JSON.stringify(body) });
}

function statusFromRunEvent(event: RunEvent): RunStatus {
  if (event.event === 'run.queued') return 'queued';
  if (event.event === 'approval.request') return 'waiting_for_approval';
  if (event.event === 'run.completed') return 'completed';
  if (event.event === 'run.failed') return 'failed';
  if (event.event === 'run.cancelled') return 'cancelled';
  if (event.event === 'run.stopping') return 'stopping';
  return 'running';
}

function Pairing({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/auth/pair', { method: 'POST', body: JSON.stringify({ code }) }); onPaired(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Pairing failed'); }
    finally { setBusy(false); }
  }
  return <main className="pairing-page"><div className="brand-mark">⌁</div><p className="eyebrow">HERMES MOBILE</p><h1>Your agent.<br /><em>In your pocket.</em></h1><p className="lede">Pair this device with the Hermes gateway to start a private session.</p><form onSubmit={submit} className="pairing-form"><label htmlFor="pairing-code">Pairing code</label><input id="pairing-code" autoComplete="one-time-code" inputMode="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter the code from your gateway" /><button className="primary-button" disabled={busy || !code.trim()}>{busy ? 'Pairing…' : 'Pair device'}</button>{error && <p className="error-text" role="alert">{error}</p>}</form><p className="quiet">Your Hermes API key stays on the gateway.</p></main>;
}

function Bot({ profile, activeSession, onSession, onRun }: { profile: string; activeSession: string; onSession: (id: string) => void; onRun: (record: RunRecord) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState(activeSession);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState('');
  const [steerDraft, setSteerDraft] = useState('');
  const [approval, setApproval] = useState<{ runId: string; requestId?: string; command?: string; choices: string[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activeSession || activeSession === sessionId) return;
    setSessionId(activeSession); setError('');
    api<{ data?: Array<{ role?: string; content?: unknown }> }>(`/api/sessions/${encodeURIComponent(activeSession)}/messages`)
      .then((body) => setMessages((body.data ?? []).map((item) => { const role: Message['role'] = item.role === 'user' ? 'user' : item.role === 'system' ? 'system' : 'assistant'; return { role, content: textFromEvent(item.content) }; }).filter((item) => item.content)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the session'));
  }, [activeSession, sessionId]);
  const canSend = Boolean(draft.trim() && !busy);
  async function send(event?: React.FormEvent) {
    event?.preventDefault(); if (!canSend) return;
    setBusy(true); setError(''); setApproval(null); const prompt = draft.trim(); setDraft('');
    const startedAt = Date.now();
    let id = sessionId;
    try {
      if (!id) {
        const created = await api<{ id?: string; session_id?: string; session?: { id?: string } }>('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'Mobile session' }) });
        id = created.id ?? created.session_id ?? created.session?.id ?? '';
        if (!id) throw new Error('Hermes did not return a session id');
        setSessionId(id); onSession(id);
      }
      setMessages((current) => [...current, { role: 'user', content: prompt }, { role: 'assistant', content: '' }]);
      await streamRun(id, prompt, (event) => {
        if (event.run_id) {
          setRunId(event.run_id);
          onRun({ runId: event.run_id, sessionId: id, prompt, status: statusFromRunEvent(event), startedAt, updatedAt: Date.now(), ...(typeof event.error === 'string' ? { error: event.error } : {}) });
        }
        if (event.event === 'message.delta' && typeof event.delta === 'string') setMessages((current) => { const next = [...current]; next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + event.delta }; return next; });
        if (event.event === 'run.completed' && typeof event.output === 'string') setMessages((current) => { if (current[current.length - 1]?.content) return current; return [...current.slice(0, -1), { role: 'assistant', content: event.output as string }]; });
        if (event.event === 'approval.request') setApproval({ runId: event.run_id ?? '', requestId: typeof event.request_id === 'string' ? event.request_id : undefined, command: typeof event.command === 'string' ? event.command : undefined, choices: Array.isArray(event.choices) ? event.choices.filter((choice): choice is string => typeof choice === 'string') : ['once', 'deny'] });
      });
    } catch (err) { setError(err instanceof Error ? err.message : 'Hermes could not complete the run'); }
    finally { setBusy(false); setRunId(''); }
  }
  async function stopRun() { if (!runId) return; try { await runControl(runId, 'stop'); } catch (err) { setError(err instanceof Error ? err.message : 'Could not stop the run'); } }
  async function steerRun(event: React.FormEvent) { event.preventDefault(); if (!runId || !steerDraft.trim()) return; try { await runControl(runId, 'steer', { input: steerDraft.trim() }); setSteerDraft(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not steer the run'); } }
  async function resolveApproval(choice: string) { if (!approval?.runId) return; try { await runControl(approval.runId, 'approval', { choice, ...(approval.requestId ? { request_id: approval.requestId } : {}) }); setApproval(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not resolve approval'); } }
  return <section className="bot-screen"><header className="screen-header"><div><p className="eyebrow">ACTIVE BOT</p><h2>{profile === 'default' ? 'Lily' : profile} <span className="status-dot" /> </h2></div><button className="icon-button" aria-label="More bot options">•••</button></header><div className="conversation" aria-live="polite">{messages.length === 0 ? <div className="empty-bot"><div className="bot-glyph">⌁</div><h1>What should Hermes do?</h1><p>Ask for an answer, start a task, or send a command. You can pick up the full session later.</p><div className="suggestions"><button onClick={() => setDraft('Give me a concise status update')}>Status update</button><button onClick={() => setDraft('What needs my attention today?')}>What needs attention?</button></div></div> : messages.map((message, index) => <article className={`message ${message.role}`} key={`${index}-${message.content.slice(0, 8)}`}><span className="message-label">{message.role === 'user' ? 'YOU' : 'HERMES'}</span><p>{message.content || (busy && index === messages.length - 1 ? 'Thinking…' : '')}</p></article>)}</div>{approval && <div className="approval-card"><span className="eyebrow">APPROVAL NEEDED</span><strong>Hermes is waiting for your decision.</strong>{approval.command && <code>{approval.command}</code>}<div className="approval-actions">{approval.choices.map((choice) => <button key={choice} className={choice === 'deny' ? 'danger-button' : 'primary-button'} onClick={() => void resolveApproval(choice)}>{choice === 'once' ? 'Allow once' : choice}</button>)}</div></div>}{error && <div className="inline-error" role="alert">{error}</div>}{busy && runId && <div className="run-controls"><button className="danger-button" onClick={() => void stopRun()}>Stop run</button><form onSubmit={steerRun}><input value={steerDraft} onChange={(event) => setSteerDraft(event.target.value)} placeholder="Steer this run…" aria-label="Steer this run" /><button disabled={!steerDraft.trim()}>Send</button></form></div>}<form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message Hermes…" aria-label="Message Hermes" rows={1} /><button className="send-button" disabled={!canSend} aria-label={busy ? 'Sending' : 'Send message'}>{busy ? '■' : '↑'}</button></form><p className="composer-hint">↵ send · shift ↵ new line · {profile}</p></section>;
}

function Bots({ selected, onSelect }: { selected: string; onSelect: (profile: ProfileInfo) => void }) {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]); const [error, setError] = useState('');
  useEffect(() => { api<{ data?: ProfileInfo[] }>('/api/profiles').then((body) => setProfiles(body.data ?? [])).catch((err) => setError(err instanceof Error ? err.message : 'Could not load bots')); }, []);
  return <section className="placeholder-screen bots-screen"><div className="screen-header"><div><p className="eyebrow">BOTS</p><h2>Your Hermes roster.</h2></div><span className="run-count">{profiles.length} profiles</span></div><p className="screen-lede">These are the local Hermes profiles on your instance. The active profile is chat-connected; stopped profiles are visible but need a gateway connection before they can run here.</p>{error && <p className="error-text" role="alert">{error}</p>}<div className="profile-list">{profiles.map((profile) => <article className={`profile-card ${profile.id === selected ? 'selected' : ''}`} key={profile.id}><button className="profile-card-main" disabled={!profile.active} onClick={() => onSelect(profile)}><span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span><span className="profile-card-copy"><strong>{profile.name}</strong><span>{profile.role}</span><small>{profile.model}</small></span><span className={`profile-status ${profile.active ? 'active' : 'stopped'}`}>{profile.active ? 'Connected' : 'Stopped'}</span></button>{!profile.active && <p className="profile-note">This profile is installed on the Mac, but its gateway is not currently serving the mobile API.</p>}</article>)}</div></section>;
}

function Sessions({ activeSession, onOpen }: { activeSession: string; onOpen: (id: string) => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [editingId, setEditingId] = useState(''); const [editTitle, setEditTitle] = useState(''); const [busyId, setBusyId] = useState('');
  async function refresh() { try { const body = await api<{ data?: SessionSummary[] }>('/api/sessions'); setSessions(body.data ?? []); } catch (err) { setError(err instanceof Error ? err.message : 'Could not load sessions'); } }
  useEffect(() => { void refresh(); }, []);
  async function rename(item: SessionSummary) { if (!editTitle.trim()) return; setBusyId(item.id); try { await api(`/api/sessions/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ title: editTitle.trim() }) }); setEditingId(''); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not rename session'); } finally { setBusyId(''); } }
  async function fork(item: SessionSummary) { setBusyId(item.id); try { const body = await api<{ session?: { id?: string } }>(`/api/sessions/${encodeURIComponent(item.id)}/fork`, { method: 'POST', body: JSON.stringify({}) }); const id = body.session?.id; await refresh(); if (id) onOpen(id); } catch (err) { setError(err instanceof Error ? err.message : 'Could not fork session'); } finally { setBusyId(''); } }
  async function remove(item: SessionSummary) { if (!window.confirm(`Delete “${item.title || 'this session'}”?`)) return; setBusyId(item.id); try { await api(`/api/sessions/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); if (activeSession === item.id) onOpen(''); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete session'); } finally { setBusyId(''); } }
  const visible = sessions.filter((item) => !item.archived && `${item.title ?? ''} ${item.preview ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="placeholder-screen sessions-screen"><div className="screen-header"><div><p className="eyebrow">SESSIONS</p><h2>Keep the thread.</h2></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh sessions">↻</button></div><input className="session-search" type="search" placeholder="Search sessions" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search sessions" />{error && <p className="error-text" role="alert">{error}</p>}<div className="session-list">{visible.length === 0 ? <div className="notice-card"><strong>{query ? 'No matches' : 'No sessions yet'}</strong><span>{query ? 'Try a different title or preview.' : 'Send your first message from Bot to create a session.'}</span></div> : visible.map((item) => <article className={`session-row ${item.id === activeSession ? 'selected' : ''}`} key={item.id}><button className="session-row-main" onClick={() => onOpen(item.id)}><span className="session-row-title">{item.title || 'Untitled session'}</span><span className="session-row-preview">{item.preview || 'No preview yet'}</span><span className="session-row-meta">{item.message_count ?? 0} messages · {item.id.slice(0, 10)}</span></button><div className="session-actions"><button onClick={() => { setEditingId(item.id); setEditTitle(item.title || ''); }}>Rename</button><button onClick={() => void fork(item)} disabled={busyId === item.id}>Fork</button><button className="danger-button" onClick={() => void remove(item)} disabled={busyId === item.id}>Delete</button></div>{editingId === item.id && <form className="rename-form" onSubmit={(event) => { event.preventDefault(); void rename(item); }}><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="New session title" autoFocus /><button disabled={!editTitle.trim() || busyId === item.id}>{busyId === item.id ? 'Saving…' : 'Save'}</button></form>}</article>)}</div></section>;
}
function Activity({ records, onOpen, onRun }: { records: RunRecord[]; onOpen: (id: string) => void; onRun: (record: RunRecord) => void }) {
  const [refreshing, setRefreshing] = useState('');
  async function refresh(record: RunRecord) {
    setRefreshing(record.runId);
    try {
      const status = await api<{ status?: RunStatus; updated_at?: number; error?: string }>(`/api/runs/${encodeURIComponent(record.runId)}`);
      onRun({ ...record, status: status.status ?? record.status, updatedAt: status.updated_at ? status.updated_at * 1000 : Date.now(), ...(status.error ? { error: status.error } : {}) });
    } catch (err) { onRun({ ...record, status: 'interrupted', updatedAt: Date.now(), error: err instanceof Error ? err.message : 'Run status unavailable' }); }
    finally { setRefreshing(''); }
  }
  return <section className="placeholder-screen activity-screen"><div className="screen-header"><div><p className="eyebrow">ACTIVITY</p><h2>Runs, at a glance.</h2></div><span className="run-count">{records.length} saved</span></div>{records.length === 0 ? <div className="notice-card"><strong>No mobile runs yet</strong><span>Runs started from this device will be recoverable here.</span></div> : <div className="run-list">{records.map((record) => <article className="run-card" key={record.runId}><div className="run-card-header"><strong>{record.status.replaceAll('_', ' ')}</strong><time dateTime={new Date(record.startedAt).toISOString()}>{new Date(record.startedAt).toLocaleString()}</time></div><p>{record.prompt}</p>{record.error && <span className="error-text">{record.error}</span>}<div className="run-card-actions"><button onClick={() => onOpen(record.sessionId)}>Open session</button><button onClick={() => void refresh(record)} disabled={refreshing === record.runId}>{refreshing === record.runId ? 'Checking…' : 'Refresh status'}</button></div></article>)}</div>}</section>; }
function Settings({ connected }: { connected: boolean }) { return <section className="placeholder-screen"><p className="eyebrow">SETTINGS</p><h2>Quiet controls.</h2><div className="settings-list"><div><span>Gateway</span><strong className={connected ? 'good' : 'bad'}>{connected ? 'Connected' : 'Unavailable'}</strong></div><div><span>Credential boundary</span><strong>Server-side</strong></div><div><span>Client</span><strong>Hermes Mobile 0.1</strong></div></div></section>; }

function App() {
  const [paired, setPaired] = useState<boolean | null>(null); const [tab, setTab] = useState<Tab>('bot'); const [connected, setConnected] = useState(false); const [session, setSession] = useState(''); const [activeProfile, setActiveProfile] = useState('default'); const [records, setRecords] = useState<RunRecord[]>(() => parseRunRecords(localStorage.getItem('hermes-mobile:runs')));
  useEffect(() => { api<{ paired: boolean }>('/api/auth/status').then((value) => setPaired(value.paired)).catch(() => setPaired(false)); }, []);
  useEffect(() => { if (paired) api('/api/capabilities').then(() => setConnected(true)).catch(() => setConnected(false)); }, [paired]);
  function saveRun(record: RunRecord) { setRecords((current) => { const next = addRunRecord(current, record); localStorage.setItem('hermes-mobile:runs', JSON.stringify(next)); return next; }); }
  function openSession(id: string) { setSession(id); setTab('bot'); }
  function selectProfile(profile: ProfileInfo) { if (!profile.active) return; setActiveProfile(profile.id); setSession(''); setTab('bot'); }
  const screen = useMemo(() => ({ bot: <Bot profile={activeProfile} activeSession={session} onSession={setSession} onRun={saveRun} />, bots: <Bots selected={activeProfile} onSelect={selectProfile} />, sessions: <Sessions activeSession={session} onOpen={openSession} />, activity: <Activity records={records} onOpen={openSession} onRun={saveRun} />, settings: <Settings connected={connected} /> }[tab]), [activeProfile, connected, records, session, tab]);
  if (paired === null) return <div className="loading-screen">Loading Hermes Mobile…</div>;
  if (!paired) return <Pairing onPaired={() => setPaired(true)} />;
  return <main className="app-shell">{screen}<nav className="tab-bar" aria-label="Primary navigation">{([['bot', '⌁', 'Bot'], ['bots', '♙', 'Bots'], ['sessions', '▤', 'Sessions'], ['activity', '◷', 'Activity'], ['settings', '⚙', 'Settings']] as const).map(([key, icon, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} aria-label={label}><span>{icon}</span><small>{label}</small></button>)}</nav></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
