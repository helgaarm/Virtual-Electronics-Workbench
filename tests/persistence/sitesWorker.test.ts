import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../sites/worker';
import { SqliteD1 } from '../sites/sqliteD1';
import { D1ProjectRepository } from '../../sites/d1ProjectRepository';
import { createLedExampleProject } from '../../src/domain/project';

const databases: SqliteD1[] = [];
afterEach(() => { vi.unstubAllGlobals(); databases.splice(0).forEach((db) => db.close()); });

describe('Sites asset and API routing', () => {
  it('serves the compiled document through the Worker with security headers for root and deep links', async () => {
    vi.stubGlobal('__SITES_INDEX_HTML__', '<html>compiled app</html>');
    const fetch = vi.fn();
    for (const path of ['/', '/index.html', '/workbench']) {
      const response = await worker.fetch(new Request(`https://example.test${path}`, { headers: { accept: 'text/html' } }), { ASSETS: { fetch } });
      expect(response.status).toBe(200); expect(await response.text()).toBe('<html>compiled app</html>');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self' https://chatgpt.com");
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    }
    const head = await worker.fetch(new Request('https://example.test/', { method: 'HEAD' }), { ASSETS: { fetch } });
    expect(head.status).toBe(200); expect(await head.text()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds security headers while preserving asset bodies, status and caching', async () => {
    const response = new Response('asset', { headers: { 'cache-control': 'public, max-age=31536000', 'content-type': 'text/javascript', etag: 'example' } });
    const fetch = vi.fn(async () => response);
    const secured = await worker.fetch(new Request('https://example.test/assets/app.js'), { ASSETS: { fetch } });
    expect(await secured.text()).toBe('asset'); expect(secured.status).toBe(200);
    expect(secured.headers.get('cache-control')).toBe('public, max-age=31536000');
    expect(secured.headers.get('etag')).toBe('example');
    expect(secured.headers.get('content-type')).toBe('text/javascript');
    expect(secured.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(secured.headers.get('content-security-policy')).toContain("frame-ancestors 'self' https://chatgpt.com");
    expect(secured.headers.get('x-content-type-options')).toBe('nosniff');
    expect(secured.headers.get('referrer-policy')).toBe('no-referrer');
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
    expect(await response.json()).toEqual({ error: 'Sign-in is unavailable.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed for every project operation when mode is missing, empty or invalid', async () => {
    const DB = new SqliteD1(); databases.push(DB);
    const repository = new D1ProjectRepository(DB);
    const saved = await repository.save(createLedExampleProject());
    for (const AUTH_MODE of [undefined, '', 'typo']) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const response = await worker.fetch(new Request(`https://example.test/api/projects/${saved.id}`, { method }), { AUTH_MODE, DB, ASSETS: { fetch: vi.fn() } });
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-security-policy')).toBeTruthy();
      }
    }
    expect(await repository.get(saved.id)).toEqual(saved);
  });

  it('requires an approved platform identity even in explicit Sites mode', async () => {
    const DB = new SqliteD1(); databases.push(DB);
    const env = { AUTH_MODE: 'sites', SITES_ALLOWED_EMAILS: 'owner@example.test', DB, ASSETS: { fetch: vi.fn() } };
    for (const headers of [{}, { 'oai-authenticated-user-email': 'stranger@example.test' }, { 'x-workbench-account': 'owner@example.test', 'OAI-Sites-Authorization': 'Bearer synthetic-owner-test-token' }]) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        expect((await worker.fetch(new Request('https://example.test/api/projects/id', { method, headers: headers as HeadersInit }), env)).status).toBe(401);
      }
    }
    const headers = { 'oai-authenticated-user-email': 'owner@example.test' };
    expect((await worker.fetch(new Request('https://example.test/api/projects', { headers }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://example.test/api/projects/id', { method: 'DELETE', headers }), env)).status).toBe(403);
    expect((await worker.fetch(new Request('https://example.test/api/auth/session', { headers }), env)).status).toBe(200);
    env.SITES_ALLOWED_EMAILS = '';
    expect((await worker.fetch(new Request('https://example.test/api/projects', { headers }), env)).status).toBe(503);
  });
});
