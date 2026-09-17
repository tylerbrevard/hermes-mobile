import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPairingService } from './auth.js';
import { listProfiles } from './profiles.js';

const PORT = Number(process.env.PORT ?? 8643);
const HOST = process.env.HOST ?? '127.0.0.1';
const HERMES_API_URL = (process.env.HERMES_API_URL ?? 'http://127.0.0.1:8642').replace(/\/$/, '');
const HERMES_API_KEY = process.env.HERMES_API_KEY ?? process.env.API_SERVER_KEY ?? '';
const WEB_DIST = process.env.WEB_DIST ?? join(process.cwd(), 'dist');
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? `http://localhost:${PORT}`;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const AUTO_PAIR_PRIVATE = process.env.AUTO_PAIR_PRIVATE === 'true';
const pairing = createPairingService(process.env.PAIRING_CODE ?? '');
if (AUTO_PAIR_PRIVATE && !WEB_ORIGIN.includes('.ts.net')) throw new Error('AUTO_PAIR_PRIVATE requires a Tailscale .ts.net WEB_ORIGIN');
const sessions = new Set<string>();
const MAX_BODY_BYTES = 256 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) ?? [];
  return cookies.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function setSessionCookie(res: ServerResponse, value: string): void {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  res.setHeader('set-cookie', `hermes_mobile_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`);
}

function isAuthenticated(req: IncomingMessage): boolean {
  if (AUTO_PAIR_PRIVATE) return true;
  const value = cookieValue(req, 'hermes_mobile_session');
  return Boolean(value && sessions.has(value));
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return !origin || origin === WEB_ORIGIN;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

function routeToHermes(pathname: string, method: string): string | undefined {
  if (method === 'GET' && pathname === '/api/capabilities') return '/v1/capabilities';
  if (method === 'GET' && pathname === '/api/models') return '/v1/models';
  if (method === 'GET' && pathname === '/api/model/options') return '/api/model/options';
  if (pathname === '/api/sessions' && ['GET', 'POST'].includes(method)) return '/api/sessions';
  if (pathname === '/api/runs' && method === 'POST') return '/v1/runs';
  const session = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(messages|fork|chat\/stream|model))?$/);
  if (session) {
    const [, id, action] = session;
    if (action === 'messages' && method === 'GET') return `/api/sessions/${encodeURIComponent(id)}/messages`;
    if (action === 'fork' && method === 'POST') return `/api/sessions/${encodeURIComponent(id)}/fork`;
    if (action === 'chat/stream' && method === 'POST') return `/api/sessions/${encodeURIComponent(id)}/chat/stream`;
    if (action === 'model' && method === 'POST') return `/api/sessions/${encodeURIComponent(id)}/model`;
    if (!action && ['GET', 'PATCH', 'DELETE'].includes(method)) return `/api/sessions/${encodeURIComponent(id)}`;
  }
  const runStatus = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runStatus && method === 'GET') return `/v1/runs/${encodeURIComponent(runStatus[1])}`;
  const run = pathname.match(/^\/api\/runs\/([^/]+)\/(events|approval|stop|steer)$/);
  if (run) {
    const [, id, action] = run;
    const expected = action === 'events' ? 'GET' : 'POST';
    if (method === expected) return `/v1/runs/${encodeURIComponent(id)}/${action}`;
  }
  return undefined;
}

async function proxy(req: IncomingMessage, res: ServerResponse, targetPath: string): Promise<void> {
  if (!HERMES_API_KEY) return json(res, 503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Hermes API key is not configured' } });
  const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : await readBody(req);
  const upstream = await fetch(`${HERMES_API_URL}${targetPath}`, {
    method: req.method,
    headers: { authorization: `Bearer ${HERMES_API_KEY}`, ...(body ? { 'content-type': req.headers['content-type'] ?? 'application/json' } : {}) },
    body: body ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    'cache-control': upstream.headers.get('cache-control') ?? 'no-store',
  });
  if (!upstream.body) { res.end(); return; }
  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (value) res.write(value);
    if (done) break;
  }
  res.end();
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const requested = req.url?.split('?')[0] ?? '/';
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\//, '');
  const candidate = normalize(join(WEB_DIST, relative));
  const file = candidate.startsWith(normalize(WEB_DIST)) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(WEB_DIST, 'index.html');
  if (!existsSync(file)) return json(res, 404, { error: { code: 'NOT_BUILT', message: 'Build the web app first' } });
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    if (url.pathname === '/api/auth/status' && method === 'GET') return json(res, 200, { paired: isAuthenticated(req) });
    if (url.pathname === '/api/auth/pair' && method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: { code: 'BAD_ORIGIN', message: 'Origin is not allowed' } });
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as { code?: string };
      if (!body.code || !pairing.consume(body.code)) return json(res, 401, { error: { code: 'PAIRING_FAILED', message: 'Pairing code is invalid or already used' } });
      const token = randomBytes(32).toString('base64url');
      sessions.add(token);
      setSessionCookie(res, token);
      return json(res, 200, { paired: true });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!isAuthenticated(req)) return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Pair this device first' } });
      if (url.pathname === '/api/profiles' && method === 'GET') return json(res, 200, { data: listProfiles() });
      if (['POST', 'PATCH', 'DELETE'].includes(method) && !sameOrigin(req)) return json(res, 403, { error: { code: 'BAD_ORIGIN', message: 'Origin is not allowed' } });
      const target = routeToHermes(url.pathname, method);
      if (!target) return json(res, 404, { error: { code: 'ROUTE_NOT_ALLOWED', message: 'Route is not exposed by the mobile gateway' } });
      return await proxy(req, res, target);
    }
    if (method === 'GET') return serveStatic(req, res);
    return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected gateway error';
    if (!res.headersSent) json(res, message === 'request body too large' ? 413 : 502, { error: { code: 'GATEWAY_ERROR', message } });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => console.log(`Hermes Mobile gateway listening on http://${HOST}:${PORT}`));
