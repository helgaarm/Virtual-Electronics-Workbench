import { describe, expect, it, vi } from 'vitest';
import worker from '../../sites/worker';

describe('Sites asset and API routing', () => {
  it('serves assets without rewriting their response', async () => {
    const response = new Response('asset');
    const fetch = vi.fn(async () => response);
    expect(await worker.fetch(new Request('https://example.test/assets/app.js'), { ASSETS: { fetch } })).toBe(response);
  });

  it('falls back to the app only for HTML navigations', async () => {
    const fetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname === '/index.html' ? 'app' : null, {
      status: new URL(request.url).pathname === '/index.html' ? 200 : 404,
    }));
    const env = { ASSETS: { fetch } };
    expect(await (await worker.fetch(new Request('https://example.test/workbench?x=1', { headers: { accept: 'text/html' } }), env)).text()).toBe('app');
    expect(fetch.mock.calls[1][0].url).toBe('https://example.test/index.html');
    expect((await worker.fetch(new Request('https://example.test/missing.js'), env)).status).toBe(404);
    expect((await worker.fetch(new Request('https://example.test/path', { method: 'POST', headers: { accept: 'text/html' } }), env)).status).toBe(404);
  });

  it('never routes API requests to the app document', async () => {
    const fetch = vi.fn();
    const response = await worker.fetch(new Request('https://example.test/api/projects', { headers: { accept: 'text/html' } }), { ASSETS: { fetch } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Sites database is unavailable. Please retry later.' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
