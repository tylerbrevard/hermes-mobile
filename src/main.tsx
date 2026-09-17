import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Tab = 'bot' | 'sessions' | 'activity' | 'settings';
type Message = { role: 'user' | 'assistant' | 'system'; content: string };
type SessionSummary = { id: string; title?: string; preview?: string; last_active?: number; message_count?: number; archived?: boolean };

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

async function streamMessage(sessionId: string, message: string, onText: (text: string) => void): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`, {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }),
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({})) as ApiError;
    throw new Error(body.error?.message ?? `Stream failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (!data) continue;
      try { onText(textFromEvent(JSON.parse(data))); } catch { onText(textFromEvent(data)); }
    }
    if (done) break;
  }
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

function Bot({ profile, activeSession, onSession }: { profile: string; activeSession: string; onSession: (id: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState(activeSession);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true); setError(''); const prompt = draft.trim(); setDraft('');
    let id = sessionId;
    try {
      if (!id) {
        const created = await api<{ id?: string; session_id?: string; session?: { id?: string } }>('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'Mobile session' }) });
        id = created.id ?? created.session_id ?? created.session?.id ?? '';
        if (!id) throw new Error('Hermes did not return a session id');
        setSessionId(id); onSession(id);
      }
      setMessages((current) => [...current, { role: 'user', content: prompt }, { role: 'assistant', content: '' }]);
      await streamMessage(id, prompt, (text) => setMessages((current) => { const next = [...current]; next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + text }; return next; }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Hermes could not complete the run'); }
    finally { setBusy(false); }
  }
  return <section className="bot-screen"><header className="screen-header"><div><p className="eyebrow">ACTIVE BOT</p><h2>Hermes <span className="status-dot" /> </h2></div><button className="icon-button" aria-label="More bot options">•••</button></header><div className="conversation" aria-live="polite">{messages.length === 0 ? <div className="empty-bot"><div className="bot-glyph">⌁</div><h1>What should Hermes do?</h1><p>Ask for an answer, start a task, or send a command. You can pick up the full session later.</p><div className="suggestions"><button onClick={() => setDraft('Give me a concise status update')}>Status update</button><button onClick={() => setDraft('What needs my attention today?')}>What needs attention?</button></div></div> : messages.map((message, index) => <article className={`message ${message.role}`} key={`${index}-${message.content.slice(0, 8)}`}><span className="message-label">{message.role === 'user' ? 'YOU' : 'HERMES'}</span><p>{message.content || (busy && index === messages.length - 1 ? 'Thinking…' : '')}</p></article>)}</div>{error && <div className="inline-error" role="alert">{error}</div>}<form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message Hermes…" aria-label="Message Hermes" rows={1} /><button className="send-button" disabled={!canSend} aria-label={busy ? 'Sending' : 'Send message'}>{busy ? '■' : '↑'}</button></form><p className="composer-hint">↵ send · shift ↵ new line · {profile}</p></section>;
}

function Sessions({ activeSession, onOpen }: { activeSession: string; onOpen: (id: string) => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState('');
  useEffect(() => { api<{ data?: SessionSummary[] }>('/api/sessions').then((body) => setSessions(body.data ?? [])).catch((err) => setError(err instanceof Error ? err.message : 'Could not load sessions')); }, []);
  const visible = sessions.filter((item) => !item.archived && `${item.title ?? ''} ${item.preview ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="placeholder-screen sessions-screen"><div className="screen-header"><div><p className="eyebrow">SESSIONS</p><h2>Keep the thread.</h2></div><button className="icon-button" onClick={() => location.reload()} aria-label="Refresh sessions">↻</button></div><input className="session-search" type="search" placeholder="Search sessions" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search sessions" />{error && <p className="error-text" role="alert">{error}</p>}<div className="session-list">{visible.length === 0 ? <div className="notice-card"><strong>{query ? 'No matches' : 'No sessions yet'}</strong><span>{query ? 'Try a different title or preview.' : 'Send your first message from Bot to create a session.'}</span></div> : visible.map((item) => <button className={`session-row ${item.id === activeSession ? 'selected' : ''}`} key={item.id} onClick={() => onOpen(item.id)}><span className="session-row-title">{item.title || 'Untitled session'}</span><span className="session-row-preview">{item.preview || 'No preview yet'}</span><span className="session-row-meta">{item.message_count ?? 0} messages · {item.id.slice(0, 10)}</span></button>)}</div></section>;
}
function Activity() { return <section className="placeholder-screen"><p className="eyebrow">ACTIVITY</p><h2>Runs, at a glance.</h2><p>Active runs and approvals will live here. The Bot screen stays uncluttered.</p><div className="notice-card"><strong>Operator controls</strong><span>Stop, steer, and approve from the run that needs you.</span></div></section>; }
function Settings({ connected }: { connected: boolean }) { return <section className="placeholder-screen"><p className="eyebrow">SETTINGS</p><h2>Quiet controls.</h2><div className="settings-list"><div><span>Gateway</span><strong className={connected ? 'good' : 'bad'}>{connected ? 'Connected' : 'Unavailable'}</strong></div><div><span>Credential boundary</span><strong>Server-side</strong></div><div><span>Client</span><strong>Hermes Mobile 0.1</strong></div></div></section>; }

function App() {
  const [paired, setPaired] = useState<boolean | null>(null); const [tab, setTab] = useState<Tab>('bot'); const [connected, setConnected] = useState(false); const [session, setSession] = useState(''); const profile = 'default';
  useEffect(() => { api<{ paired: boolean }>('/api/auth/status').then((value) => setPaired(value.paired)).catch(() => setPaired(false)); }, []);
  useEffect(() => { if (paired) api('/api/capabilities').then(() => setConnected(true)).catch(() => setConnected(false)); }, [paired]);
  const screen = useMemo(() => ({ bot: <Bot profile={profile} activeSession={session} onSession={setSession} />, sessions: <Sessions activeSession={session} onOpen={(id) => { setSession(id); setTab('bot'); }} />, activity: <Activity />, settings: <Settings connected={connected} /> }[tab]), [connected, profile, session, tab]);
  if (paired === null) return <div className="loading-screen">Loading Hermes Mobile…</div>;
  if (!paired) return <Pairing onPaired={() => setPaired(true)} />;
  return <main className="app-shell">{screen}<nav className="tab-bar" aria-label="Primary navigation">{([['bot', '⌁', 'Bot'], ['sessions', '▤', 'Sessions'], ['activity', '◷', 'Activity'], ['settings', '⚙', 'Settings']] as const).map(([key, icon, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} aria-label={label}><span>{icon}</span><small>{label}</small></button>)}</nav></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
