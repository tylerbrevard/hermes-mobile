import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addRunRecord, parseRunRecords, type RunRecord, type RunStatus } from './activity';
import './styles.css';

type Tab = 'bot' | 'bots' | 'sessions' | 'activity' | 'settings';
type Message = { role: 'user' | 'assistant' | 'system'; content: string };
type SessionSummary = { id: string; title?: string; preview?: string; last_active?: number; message_count?: number; archived?: boolean };
type ProfileInfo = { id: string; name: string; role: string; model: string; active: boolean };
type ModelProvider = { slug: string; name: string; is_current?: boolean; models: string[]; capabilities?: Record<string, { reasoning?: boolean; can_disable_reasoning?: boolean; fast?: boolean }> };
type ModelOptions = { providers?: ModelProvider[]; model?: string; provider?: string };
type SkillInfo = { name: string; description?: string; category?: string };
type ToolsetInfo = { name: string; label?: string; description?: string; enabled?: boolean; configured?: boolean; tools?: string[] };

type ApiError = { error?: { code?: string; message?: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as ApiError).error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

function profileApiPath(profile: string, path: string): string {
  return profile === 'default' ? path : `/api/profiles/${encodeURIComponent(profile)}${path.replace(/^\/api/, '')}`;
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

async function streamRun(profile: string, sessionId: string, message: string, onEvent: (event: RunEvent) => void, model?: string, modelOptions?: Record<string, unknown>): Promise<string> {
  const admitted = await api<{ run_id: string }>(profileApiPath(profile, '/api/runs'), { method: 'POST', body: JSON.stringify({ input: message, session_id: sessionId, ...(model ? { model } : {}), ...(modelOptions ? { model_options: modelOptions } : {}) }) });
  onEvent({ event: 'run.queued', run_id: admitted.run_id, status: 'queued' });
  const response = await fetch(profileApiPath(profile, `/api/runs/${encodeURIComponent(admitted.run_id)}/events`), { credentials: 'include' });
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

async function runControl(profile: string, runId: string, action: 'stop' | 'steer' | 'approval', body: Record<string, unknown> = {}) {
  return api(profileApiPath(profile, `/api/runs/${encodeURIComponent(runId)}/${action}`), { method: 'POST', body: JSON.stringify(body) });
}

function profileTone(id: string): string {
  const tones = ['moss', 'sky', 'amber', 'rose', 'violet', 'cyan'];
  return tones[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
}

function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

function profileMark(profile: ProfileInfo): string {
  return profileInitials(profile.name);
}

function modelShortName(model: string): string {
  return model.replace(/^[^/:]+[/:]/i, '').replace(/-highspeed$/i, ' fast');
}

function roleShortName(role: string): string {
  const firstSentence = role.split(/[.!?]/)[0].trim();
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}…` : firstSentence;
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
  const [modelOptions, setModelOptions] = useState<ModelOptions>({});
  const [selectedModel, setSelectedModel] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [modelBusy, setModelBusy] = useState(false);
  useEffect(() => {
    api<ModelOptions>(profileApiPath(profile, '/api/model/options')).then((value) => { setModelOptions(value); if (value.model && (value.providers ?? []).some((provider) => provider.models.includes(value.model!))) setSelectedModel(value.model); }).catch(() => setModelOptions({}));
  }, [profile]);
  const modelChoices = useMemo(() => (modelOptions.providers ?? []).flatMap((provider) => provider.models.map((model) => ({ model, provider: provider.name, capabilities: provider.capabilities?.[model] }))), [modelOptions]);
  const selectedCapability = modelChoices.find((choice) => choice.model === selectedModel)?.capabilities;
  const runtimeOptions = reasoning ? { reasoning: { effort: reasoning } } : undefined;
  async function changeModel(value: string) {
    setSelectedModel(value); if (!sessionId || !value) return;
    setModelBusy(true); setError('');
    try { await api(profileApiPath(profile, `/api/sessions/${encodeURIComponent(sessionId)}/model`), { method: 'POST', body: JSON.stringify({ model: value, ...(runtimeOptions ? { model_options: runtimeOptions } : {}) }) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not lock the session model'); }
    finally { setModelBusy(false); }
  }
  useEffect(() => {
    if (!activeSession || activeSession === sessionId) return;
    setSessionId(activeSession); setError('');
    api<{ data?: Array<{ role?: string; content?: unknown }> }>(profileApiPath(profile, `/api/sessions/${encodeURIComponent(activeSession)}/messages`))
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
        const created = await api<{ id?: string; session_id?: string; session?: { id?: string } }>(profileApiPath(profile, '/api/sessions'), { method: 'POST', body: JSON.stringify({ title: 'Mobile session' }) });
        id = created.id ?? created.session_id ?? created.session?.id ?? '';
        if (!id) throw new Error('Hermes did not return a session id');
        setSessionId(id); onSession(id);
      }
      setMessages((current) => [...current, { role: 'user', content: prompt }, { role: 'assistant', content: '' }]);
      await streamRun(profile, id, prompt, (event) => {
        if (event.run_id) {
          setRunId(event.run_id);
          onRun({ runId: event.run_id, sessionId: id, profile, prompt, status: statusFromRunEvent(event), startedAt, updatedAt: Date.now(), ...(typeof event.error === 'string' ? { error: event.error } : {}) });
        }
        if (event.event === 'message.delta' && typeof event.delta === 'string') setMessages((current) => { const next = [...current]; next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + event.delta }; return next; });
        if (event.event === 'run.completed' && typeof event.output === 'string') setMessages((current) => { if (current[current.length - 1]?.content) return current; return [...current.slice(0, -1), { role: 'assistant', content: event.output as string }]; });
        if (event.event === 'approval.request') setApproval({ runId: event.run_id ?? '', requestId: typeof event.request_id === 'string' ? event.request_id : undefined, command: typeof event.command === 'string' ? event.command : undefined, choices: Array.isArray(event.choices) ? event.choices.filter((choice): choice is string => typeof choice === 'string') : ['once', 'deny'] });
      }, selectedModel || undefined, runtimeOptions);
    } catch (err) { setError(err instanceof Error ? err.message : 'Hermes could not complete the run'); }
    finally { setBusy(false); setRunId(''); }
  }
  async function stopRun() { if (!runId) return; try { await runControl(profile, runId, 'stop'); } catch (err) { setError(err instanceof Error ? err.message : 'Could not stop the run'); } }
  async function steerRun(event: React.FormEvent) { event.preventDefault(); if (!runId || !steerDraft.trim()) return; try { await runControl(profile, runId, 'steer', { input: steerDraft.trim() }); setSteerDraft(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not steer the run'); } }
  async function resolveApproval(choice: string) { if (!approval?.runId) return; try { await runControl(profile, approval.runId, 'approval', { choice, ...(approval.requestId ? { request_id: approval.requestId } : {}) }); setApproval(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not resolve approval'); } }
  return <section className="bot-screen"><header className="chat-header"><div className="chat-title"><span className={`bot-avatar bot-avatar-small tone-${profileTone(profile)}`}>{profileInitials(profile === 'default' ? 'Lily' : profile)}<i /></span><div><p className="eyebrow">CHAT</p><h1>{profile === 'default' ? 'Lily' : profile}</h1><span className="chat-status"><b /> Online · ready</span></div></div><div className="chat-header-actions"><button className="icon-button" onClick={() => { setSessionId(''); setMessages([]); onSession(''); }} aria-label="New chat">＋</button><button className="icon-button" aria-label="More bot options">•••</button></div></header><div className="chat-model-row"><div className="model-controls"><label><span className="sr-only">Model</span><select value={selectedModel} onChange={(event) => void changeModel(event.target.value)} disabled={modelBusy} aria-label="Model"><option value="">Auto · profile default</option>{modelChoices.map((choice) => <option key={`${choice.provider}-${choice.model}`} value={choice.model}>{choice.provider} · {choice.model}</option>)}</select></label>{selectedCapability?.reasoning && <label><span className="sr-only">Reasoning effort</span><select value={reasoning} onChange={(event) => setReasoning(event.target.value)} aria-label="Reasoning effort"><option value="">Reasoning · auto</option><option value="low">Reasoning · low</option><option value="medium">Reasoning · medium</option><option value="high">Reasoning · high</option></select></label>}</div></div><div className="conversation" aria-live="polite">{messages.length === 0 ? <div className="empty-bot"><div className="bot-glyph">⌁</div><h1>What should Hermes do?</h1><p>Ask for an answer, start a task, or send a command. You can pick up the full session later.</p><div className="suggestions"><button onClick={() => setDraft('Give me a concise status update')}>Status update</button><button onClick={() => setDraft('What needs my attention today?')}>What needs attention?</button></div></div> : messages.map((message, index) => <article className={`message ${message.role}`} key={`${index}-${message.content.slice(0, 8)}`}><span className="message-label">{message.role === 'user' ? 'YOU' : 'HERMES'}</span><p>{message.content || (busy && index === messages.length - 1 ? 'Thinking…' : '')}</p></article>)}</div>{approval && <div className="approval-card"><span className="eyebrow">APPROVAL NEEDED</span><strong>Hermes is waiting for your decision.</strong>{approval.command && <code>{approval.command}</code>}<div className="approval-actions">{approval.choices.map((choice) => <button key={choice} className={choice === 'deny' ? 'danger-button' : 'primary-button'} onClick={() => void resolveApproval(choice)}>{choice === 'once' ? 'Allow once' : choice}</button>)}</div></div>}{error && <div className="inline-error" role="alert">{error}</div>}{busy && runId && <div className="run-controls"><button className="danger-button" onClick={() => void stopRun()}>Stop run</button><form onSubmit={steerRun}><input value={steerDraft} onChange={(event) => setSteerDraft(event.target.value)} placeholder="Steer this run…" aria-label="Steer this run" /><button disabled={!steerDraft.trim()}>Send</button></form></div>}<form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message Hermes…" aria-label="Message Hermes" rows={1} /><button className="send-button" disabled={!canSend} aria-label={busy ? 'Sending' : 'Send message'}>{busy ? '■' : '↑'}</button></form><p className="composer-hint">↵ send · shift ↵ new line · {profile}</p></section>;
}

function Bots({ selected, onSelect }: { selected: string; onSelect: (profile: ProfileInfo) => void }) {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<{ data?: ProfileInfo[] }>('/api/profiles').then((body) => setProfiles(body.data ?? [])).catch((err) => setError(err instanceof Error ? err.message : 'Could not load bots')); }, []);
  const active = profiles.find((profile) => profile.id === selected) ?? profiles.find((profile) => profile.active) ?? profiles[0];
  const ready = profiles.filter((profile) => profile.active);
  const stopped = profiles.filter((profile) => !profile.active);
  return <section className="command-center">
    <header className="command-header"><div className="brand-lockup"><span className="brand-orbit">⌁</span><div><p className="eyebrow">HERMES</p><strong>Agents</strong></div></div><span className="live-pill"><i /> {ready.length} online</span></header>
    <div className="command-intro"><p className="eyebrow">YOUR BOTS</p><h1>Choose a bot.</h1><p>Start a conversation with one of your agents.</p></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {active && <article className={`featured-bot tone-${profileTone(active.id)}`}>
      <div className="featured-bot-top"><div className={`bot-avatar bot-avatar-large tone-${profileTone(active.id)}`}><span>{profileMark(active)}</span>{active.active && <i />}</div><div className="featured-bot-status"><span className="status-label">{active.active ? 'ONLINE NOW' : 'OFFLINE'}</span><span>{active.active ? 'Ready for a task' : 'Gateway not serving'}</span></div><span className="featured-kicker">ACTIVE</span></div>
      <div className="featured-bot-copy"><h2>{active.name}</h2><p>{roleShortName(active.role)}</p><div className="bot-meta"><span><b className="meta-dot" /> {modelShortName(active.model)}</span><span>{active.active ? 'Connected' : 'Stopped'}</span></div></div>
      <button className="featured-action" disabled={!active.active} onClick={() => onSelect(active)}>{active.active ? 'Open workspace' : 'Unavailable'} <span>↗</span></button>
    </article>}
    <section className="quick-switch" aria-labelledby="quick-switch-title"><div className="section-heading"><div><p className="eyebrow">QUICK SWITCH</p><h2 id="quick-switch-title">Jump to a bot</h2></div><span>{ready.length} available</span></div><div className="bot-rail" role="list">{ready.map((profile) => <button role="listitem" className={`bot-chip ${profile.id === selected ? 'selected' : ''}`} key={profile.id} onClick={() => onSelect(profile)} aria-label={`Open ${profile.name}`}><span className={`bot-avatar bot-avatar-small tone-${profileTone(profile.id)}`}>{profileMark(profile)}<i /></span><span>{profile.name}</span></button>)}</div></section>
    <section className="operator-list" aria-labelledby="operator-list-title"><div className="section-heading"><div><p className="eyebrow">BOTS</p><h2 id="operator-list-title">Your bots</h2></div><span>{profiles.length} total</span></div><div className="operator-rows">{ready.map((profile) => <button className={`operator-row ${profile.id === selected ? 'selected' : ''}`} key={profile.id} onClick={() => onSelect(profile)} aria-label={`Open ${profile.name}: ${profile.role}. Model ${profile.model}`}><span className={`bot-avatar bot-avatar-medium tone-${profileTone(profile.id)}`}>{profileMark(profile)}<i /></span><span className="operator-copy"><strong>{profile.name}</strong><span title={profile.role}>{roleShortName(profile.role)}</span></span><span className="operator-model">{modelShortName(profile.model)}</span><span className="row-chevron">›</span></button>)}{stopped.length > 0 && <details className="stopped-operators"><summary><span>Unavailable operators</span><span>{stopped.length}</span></summary>{stopped.map((profile) => <div className="operator-row stopped" key={profile.id}><span className={`bot-avatar bot-avatar-medium tone-${profileTone(profile.id)}`}>{profileMark(profile)}</span><span className="operator-copy"><strong>{profile.name}</strong><span>{roleShortName(profile.role)}</span></span><span className="operator-model">Stopped</span></div>)}</details>}</div></section>
  </section>;
}

function Sessions({ profile, activeSession, onOpen }: { profile: string; activeSession: string; onOpen: (id: string, profile?: string) => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [editingId, setEditingId] = useState(''); const [editTitle, setEditTitle] = useState(''); const [busyId, setBusyId] = useState('');
  async function refresh() { try { const body = await api<{ data?: SessionSummary[] }>(profileApiPath(profile, '/api/sessions')); setSessions(body.data ?? []); } catch (err) { setError(err instanceof Error ? err.message : 'Could not load sessions'); } }
  useEffect(() => { void refresh(); }, [profile]);
  async function rename(item: SessionSummary) { if (!editTitle.trim()) return; setBusyId(item.id); try { await api(profileApiPath(profile, `/api/sessions/${encodeURIComponent(item.id)}`), { method: 'PATCH', body: JSON.stringify({ title: editTitle.trim() }) }); setEditingId(''); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not rename session'); } finally { setBusyId(''); } }
  async function fork(item: SessionSummary) { setBusyId(item.id); try { const body = await api<{ session?: { id?: string } }>(profileApiPath(profile, `/api/sessions/${encodeURIComponent(item.id)}/fork`), { method: 'POST', body: JSON.stringify({}) }); const id = body.session?.id; await refresh(); if (id) onOpen(id, profile); } catch (err) { setError(err instanceof Error ? err.message : 'Could not fork session'); } finally { setBusyId(''); } }
  async function remove(item: SessionSummary) { if (!window.confirm(`Delete “${item.title || 'this session'}”?`)) return; setBusyId(item.id); try { await api(profileApiPath(profile, `/api/sessions/${encodeURIComponent(item.id)}`), { method: 'DELETE' }); if (activeSession === item.id) onOpen('', profile); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete session'); } finally { setBusyId(''); } }
  const visible = sessions.filter((item) => !item.archived && `${item.title ?? ''} ${item.preview ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="placeholder-screen sessions-screen"><div className="screen-header"><div><p className="eyebrow">SESSIONS</p><h2>Keep the thread.</h2></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh sessions">↻</button></div><input className="session-search" type="search" placeholder="Search sessions" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search sessions" />{error && <p className="error-text" role="alert">{error}</p>}<div className="session-list">{visible.length === 0 ? <div className="notice-card"><strong>{query ? 'No matches' : 'No sessions yet'}</strong><span>{query ? 'Try a different title or preview.' : 'Send your first message from Bot to create a session.'}</span></div> : visible.map((item) => <article className={`session-row ${item.id === activeSession ? 'selected' : ''}`} key={item.id}><button className="session-row-main" onClick={() => onOpen(item.id)}><span className="session-row-title">{item.title || 'Untitled session'}</span><span className="session-row-preview">{item.preview || 'No preview yet'}</span><span className="session-row-meta">{item.message_count ?? 0} messages · {item.id.slice(0, 10)}</span></button><div className="session-actions"><button onClick={() => { setEditingId(item.id); setEditTitle(item.title || ''); }}>Rename</button><button onClick={() => void fork(item)} disabled={busyId === item.id}>Fork</button><button className="danger-button" onClick={() => void remove(item)} disabled={busyId === item.id}>Delete</button></div>{editingId === item.id && <form className="rename-form" onSubmit={(event) => { event.preventDefault(); void rename(item); }}><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="New session title" autoFocus /><button disabled={!editTitle.trim() || busyId === item.id}>{busyId === item.id ? 'Saving…' : 'Save'}</button></form>}</article>)}</div></section>;
}
function Activity({ records, onOpen, onRun }: { records: RunRecord[]; onOpen: (id: string, profile?: string) => void; onRun: (record: RunRecord) => void }) {
  const [refreshing, setRefreshing] = useState('');
  async function refresh(record: RunRecord) {
    setRefreshing(record.runId);
    try {
      const status = await api<{ status?: RunStatus; updated_at?: number; error?: string }>(profileApiPath(record.profile ?? 'default', `/api/runs/${encodeURIComponent(record.runId)}`));
      onRun({ ...record, status: status.status ?? record.status, updatedAt: status.updated_at ? status.updated_at * 1000 : Date.now(), ...(status.error ? { error: status.error } : {}) });
    } catch (err) { onRun({ ...record, status: 'interrupted', updatedAt: Date.now(), error: err instanceof Error ? err.message : 'Run status unavailable' }); }
    finally { setRefreshing(''); }
  }
  return <section className="placeholder-screen activity-screen"><div className="screen-header"><div><p className="eyebrow">ACTIVITY</p><h2>Runs, at a glance.</h2></div><span className="run-count">{records.length} saved</span></div>{records.length === 0 ? <div className="notice-card"><strong>No mobile runs yet</strong><span>Runs started from this device will be recoverable here.</span></div> : <div className="run-list">{records.map((record) => <article className="run-card" key={record.runId}><div className="run-card-header"><strong>{record.status.replaceAll('_', ' ')}</strong><time dateTime={new Date(record.startedAt).toISOString()}>{new Date(record.startedAt).toLocaleString()}</time></div><p>{record.prompt}</p>{record.error && <span className="error-text">{record.error}</span>}<div className="run-card-actions"><button onClick={() => onOpen(record.sessionId, record.profile)}>Open session</button><button onClick={() => void refresh(record)} disabled={refreshing === record.runId}>{refreshing === record.runId ? 'Checking…' : 'Refresh status'}</button></div></article>)}</div>}</section>; }
function Settings({ connected, profile, onProfile, onClearActivity }: { connected: boolean; profile: string; onProfile: (profile: ProfileInfo) => void; onClearActivity: () => void }) {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]); const [health, setHealth] = useState<{ version?: string; status?: string } | null>(null); const [skills, setSkills] = useState<SkillInfo[]>([]); const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]); const [appearance, setAppearance] = useState(() => localStorage.getItem('hermes-mobile:appearance') ?? 'system');
  useEffect(() => {
    void Promise.allSettled([api<{ data?: ProfileInfo[] }>('/api/profiles'), api<{ skills?: unknown[]; data?: unknown[] }>('/api/skills'), api<{ toolsets?: unknown[]; data?: unknown[] }>('/api/toolsets'), api<{ version?: string; status?: string }>('/api/health/detailed')]).then(([profileResult, skillsResult, toolsetsResult, healthResult]) => {
      if (profileResult.status === 'fulfilled') setProfiles(profileResult.value.data ?? []);
      if (skillsResult.status === 'fulfilled') setSkills((skillsResult.value.data ?? []) as SkillInfo[]);
      if (toolsetsResult.status === 'fulfilled') setToolsets((toolsetsResult.value.data ?? []) as ToolsetInfo[]);
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    });
  }, []);
  function changeAppearance(value: string) { setAppearance(value); localStorage.setItem('hermes-mobile:appearance', value); document.documentElement.dataset.appearance = value; }
  return <section className="placeholder-screen settings-screen"><p className="eyebrow">SETTINGS</p><h2>Quiet controls.</h2><p className="screen-lede">The mobile gateway keeps credentials server-side. These controls change the client or select a profile; Hermes remains the source of truth for agent configuration.</p><div className="settings-list"><div><span>Gateway</span><strong className={connected ? 'good' : 'bad'}>{connected ? 'Connected' : 'Unavailable'}</strong></div><div><span>Health</span><strong>{health?.status ?? 'Checking…'}{health?.version ? ` · ${health.version}` : ''}</strong></div><div><span>Active profile</span><select value={profile} onChange={(event) => { const next = profiles.find((item) => item.id === event.target.value); if (next?.active) onProfile(next); }} aria-label="Active profile">{profiles.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? '' : ' · stopped'}</option>)}</select></div><div><span>Appearance</span><select value={appearance} onChange={(event) => changeAppearance(event.target.value)} aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option><option value="dim">Dim</option></select></div><div><span>Capabilities</span><strong>{skills.length} skills · {toolsets.length} toolsets</strong></div><div><span>Credential boundary</span><strong>Server-side</strong></div><div><span>Client</span><strong>Hermes Mobile 0.2</strong></div></div><div className="settings-details"><details><summary>Skills inventory <span>{skills.length}</span></summary><div className="settings-detail-list">{skills.slice(0, 80).map((skill) => <div key={`${skill.category}-${skill.name}`}><strong>{skill.name}</strong><span>{skill.description || skill.category || 'Installed skill'}</span></div>)}{skills.length > 80 && <small>Showing the first 80 installed skills.</small>}</div></details><details><summary>Toolsets <span>{toolsets.length}</span></summary><div className="settings-detail-list">{toolsets.map((toolset) => <div key={toolset.name}><strong>{toolset.label || toolset.name}</strong><span>{toolset.enabled ? 'Enabled' : 'Disabled'} · {(toolset.tools ?? []).length} tools</span></div>)}</div></details></div><button className="secondary-button" onClick={onClearActivity}>Clear local activity</button></section>; }

function TabIcon({ tab }: { tab: Tab }) {
  const paths: Record<Tab, string> = {
    bot: 'M4 5.5h16v10H8l-4 3v-13Z',
    sessions: 'M6 4h12a2 2 0 0 1 2 2v12H4V6a2 2 0 0 1 2-2Zm0 4h12M8 13h8M8 16h5',
    bots: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 20a5.5 5.5 0 0 1 11 0M14 20a4 4 0 0 1 7.5 0',
    activity: 'M4 17V7m5 10V4m6 13V9m5 8V6',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-6v2m0 15v2m9.5-9.5h-2m-15 0h-2m14.2-6.7-1.4 1.4M6.7 17.3l-1.4 1.4m13.4 0-1.4-1.4M6.7 6.7 5.3 5.3',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[tab]} /></svg>;
}

function App() {
  const [paired, setPaired] = useState<boolean | null>(null); const [tab, setTab] = useState<Tab>('bot'); const [connected, setConnected] = useState(false); const [session, setSession] = useState(''); const [activeProfile, setActiveProfile] = useState('default'); const [records, setRecords] = useState<RunRecord[]>(() => parseRunRecords(localStorage.getItem('hermes-mobile:runs')));
  useEffect(() => { api<{ paired: boolean }>('/api/auth/status').then((value) => setPaired(value.paired)).catch(() => setPaired(false)); }, []);
  useEffect(() => { if (paired) api(profileApiPath(activeProfile, '/api/capabilities')).then(() => setConnected(true)).catch(() => setConnected(false)); }, [paired, activeProfile]);
  useEffect(() => { document.documentElement.dataset.appearance = localStorage.getItem('hermes-mobile:appearance') ?? 'system'; }, []);
  function saveRun(record: RunRecord) { setRecords((current) => { const next = addRunRecord(current, record); localStorage.setItem('hermes-mobile:runs', JSON.stringify(next)); return next; }); }
  function clearActivity() { localStorage.removeItem('hermes-mobile:runs'); setRecords([]); }
  function openSession(id: string, profile = activeProfile) { if (profile !== activeProfile) setActiveProfile(profile); setSession(id); setTab('bot'); }
  function selectProfile(profile: ProfileInfo) { if (!profile.active) return; setActiveProfile(profile.id); setSession(''); setTab('bot'); }
  const screen = useMemo(() => ({ bot: <Bot profile={activeProfile} activeSession={session} onSession={setSession} onRun={saveRun} />, bots: <Bots selected={activeProfile} onSelect={selectProfile} />, sessions: <Sessions profile={activeProfile} activeSession={session} onOpen={openSession} />, activity: <Activity records={records} onOpen={openSession} onRun={saveRun} />, settings: <Settings connected={connected} profile={activeProfile} onProfile={selectProfile} onClearActivity={clearActivity} /> }[tab]), [activeProfile, connected, records, session, tab]);
  if (paired === null) return <div className="loading-screen">Loading Hermes Mobile…</div>;
  if (!paired) return <Pairing onPaired={() => setPaired(true)} />;
  return <main className="app-shell">{screen}<nav className="tab-bar" aria-label="Primary navigation">{([['bot', 'Chat'], ['sessions', 'Sessions'], ['bots', 'Bots'], ['activity', 'Activity'], ['settings', 'Settings']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} aria-label={label}><span><TabIcon tab={key} /></span><small>{label}</small></button>)}</nav></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
