import { describe, expect, it } from 'vitest';
import { routeToHermesRequest } from './routes.js';

describe('mobile Hermes route contract', () => {
  it('maps supported default routes', () => {
    expect(routeToHermesRequest('/api/models', 'GET')).toEqual({ targetPath: '/v1/models' });
    expect(routeToHermesRequest('/api/sessions/abc/messages', 'GET')).toEqual({ targetPath: '/api/sessions/abc/messages' });
  });

  it('scopes a supported route to a named profile', () => {
    expect(routeToHermesRequest('/api/profiles/digg/sessions', 'GET')).toEqual({
      targetPath: '/p/digg/api/sessions', profileId: 'digg',
    });
  });

  it('rejects traversal and unsupported methods', () => {
    expect(routeToHermesRequest('/api/profiles/../sessions', 'GET')).toBeUndefined();
    expect(routeToHermesRequest('/api/models', 'POST')).toBeUndefined();
  });
});
