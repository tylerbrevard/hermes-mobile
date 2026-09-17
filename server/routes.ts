const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

type MobileRoute = { targetPath: string; profileId?: string };

function defaultRoute(pathname: string, method: string): string | undefined {
  if (method === 'GET' && pathname === '/api/capabilities') return '/v1/capabilities';
  if (method === 'GET' && pathname === '/api/models') return '/v1/models';
  if (method === 'GET' && pathname === '/api/model/options') return '/api/model/options';
  if (method === 'GET' && pathname === '/api/skills') return '/v1/skills';
  if (method === 'GET' && pathname === '/api/toolsets') return '/v1/toolsets';
  if (method === 'GET' && pathname === '/api/health') return '/health';
  if (method === 'GET' && pathname === '/api/health/detailed') return '/health/detailed';
  if (pathname === '/api/sessions' && ['GET', 'POST'].includes(method)) return '/api/sessions';
  if (pathname === '/api/runs' && method === 'POST') return '/v1/runs';
  const session = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(messages|fork|chat\/stream|model))?$/);
  if (session) {
    const [, id, action] = session;
    const encodedId = encodeURIComponent(id);
    if (action === 'messages' && method === 'GET') return `/api/sessions/${encodedId}/messages`;
    if (action === 'fork' && method === 'POST') return `/api/sessions/${encodedId}/fork`;
    if (action === 'chat/stream' && method === 'POST') return `/api/sessions/${encodedId}/chat/stream`;
    if (action === 'model' && method === 'POST') return `/api/sessions/${encodedId}/model`;
    if (!action && ['GET', 'PATCH', 'DELETE'].includes(method)) return `/api/sessions/${encodedId}`;
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

export function routeToHermesRequest(pathname: string, method: string): MobileRoute | undefined {
  const profile = pathname.match(/^\/api\/profiles\/([^/]+)(\/.*)$/);
  if (!profile) {
    const targetPath = defaultRoute(pathname, method);
    return targetPath ? { targetPath } : undefined;
  }
  const [, rawProfile, profilePath] = profile;
  let profileId: string;
  try { profileId = decodeURIComponent(rawProfile); } catch { return undefined; }
  if (!PROFILE_ID.test(profileId)) return undefined;
  const normalizedProfilePath = profilePath.startsWith('/api/') || profilePath.startsWith('/v1/') ? profilePath : `/api${profilePath}`;
  const targetPath = defaultRoute(normalizedProfilePath, method);
  return targetPath ? { targetPath: `/p/${encodeURIComponent(profileId)}${targetPath}`, profileId } : undefined;
}
