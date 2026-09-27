import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../../sites/worker';
import { D1ProjectRepository } from '../../sites/d1ProjectRepository';
import { AuthStore } from '../../sites/auth/store';
import { createLedExampleProject } from '../../src/domain/project';
import { SqliteD1 } from './sqliteD1';

const databases: SqliteD1[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); databases.splice(0).forEach((db) => db.close()); });

function setup() {
  const database = new SqliteD1(); databases.push(database);
  const deliveries: { email: string; code: string }[] = [];
  const send = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(options.body)) as { to: string[]; text: string };
    deliveries.push({ email: body.to[0], code: /code is (\d{8})/.exec(body.text)![1] });
    return new Response('{}');
  });
  vi.stubGlobal('fetch', send);
  const env = {
    DB: database, ASSETS: { fetch: async () => new Response('app') }, AUTH_MODE: 'email',
    EMAIL_ALLOWED_ADDRESSES: 'owner@example.test, guest@example.test', LEGACY_PROJECT_OWNER_EMAIL: 'owner@example.test',
    EMAIL_AUTH_SECRET: 'synthetic-test-secret-'.repeat(3), RESEND_API_KEY: 'test-only-not-a-key', AUTH_EMAIL_FROM: 'login@example.test',
  };
  const call = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => worker.fetch(new Request(`https://workbench.test${path}`, {
    method, headers: { origin: 'https://workbench.test', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const requestCode = async (email = 'owner@example.test') => {
    const response = await call('/api/auth/request-code', 'POST', { email });
    expect(response.status).toBe(202);
    const { challengeId } = await response.json() as { challengeId: string };
    return { challengeId, code: deliveries.at(-1)?.code ?? '' };
  };
  const login = async (email = 'owner@example.test') => {
    const code = await requestCode(email);
    const response = await call('/api/auth/verify-code', 'POST', code);
    expect(response.status).toBe(200);
    return { cookie: response.headers.get('set-cookie')!.split(';')[0], 'x-workbench-account': email };
  };
  return { database, env, call, send, deliveries, requestCode, login };
}

describe('email code authentication and project authorization', () => {
  it('sends only through Resend, accepts normalized approved emails and creates a secure session', async () => {
    const { call, requestCode, deliveries, database } = setup();
    expect(await (await call('/api/auth/session')).json()).toEqual({ mode: 'email', available: true, user: null });
    const code = await requestCode(' OWNER@Example.Test ');
    expect(deliveries[0].email).toBe('owner@example.test');
    const row = database.database.prepare('SELECT code_hash FROM auth_codes').get();
    expect(row?.code_hash).not.toContain(code.code);
    const response = await call('/api/auth/verify-code', 'POST', code);
    expect(await response.json()).toEqual({ user: { email: 'owner@example.test' } });
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^__Host-workbench-session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
    expect(await (await call('/api/auth/session', 'GET', undefined, { cookie: cookie.split(';')[0] })).json()).toMatchObject({ user: { email: 'owner@example.test' } });
    expect(database.database.prepare('SELECT token_hash FROM auth_sessions').get()?.token_hash).not.toBe(cookie.split(';')[0].split('=')[1]);
  });

  it('never sends unapproved addresses mail or reveals allowlist membership in successful responses', async () => {
    const { call, send } = setup();
    for (const email of ['unknown@example.test', 'owner@example.test']) {
      const response = await call('/api/auth/request-code', 'POST', { email });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ challengeId: expect.stringMatching(/^[a-f0-9]{64}$/), message: 'If this email has access, a code will arrive shortly.', retryAfterSeconds: 60 });
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect((await call('/api/auth/request-code', 'POST', { email: 'x@example.test\r\nBcc: y@example.test' })).status).toBe(400);
  });

  it('bounds guesses, code lifetime, replay and simultaneous consumption', async () => {
    const { call, requestCode, database } = setup();
    const first = await requestCode();
    const wrong = first.code === '00000000' ? '11111111' : '00000000';
    for (let index = 0; index < 5; index++) expect((await call('/api/auth/verify-code', 'POST', { ...first, code: wrong })).status).toBe(400);
    expect((await call('/api/auth/verify-code', 'POST', first)).status).toBe(400);
    const second = await requestCode('guest@example.test');
    database.database.prepare('UPDATE auth_codes SET expires_at = 0 WHERE challenge_id = ?').run(second.challengeId);
    expect((await call('/api/auth/verify-code', 'POST', second)).status).toBe(400);
    expect(database.database.prepare('SELECT count(*) AS count FROM auth_sessions').get()?.count).toBe(0);
  });

  it('allows exactly one concurrent redemption and rejects replay', async () => {
    const { call, requestCode, database } = setup();
    const code = await requestCode('guest@example.test');
    const responses = await Promise.all([call('/api/auth/verify-code', 'POST', code), call('/api/auth/verify-code', 'POST', code)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect((await call('/api/auth/verify-code', 'POST', code)).status).toBe(400);
    expect(database.database.prepare('SELECT count(*) AS count FROM auth_sessions').get()?.count).toBe(1);
  });

  it('rate limits email delivery persistently across requests and bounds total sending', async () => {
    const { call, requestCode, send, database } = setup();
    await requestCode(); await requestCode();
    expect(send).toHaveBeenCalledTimes(1);
    // Expiring just the minute bucket permits resend, without resetting the hourly budget.
    for (let index = 0; index < 5; index++) {
      database.database.exec("UPDATE auth_limits SET expires_at = 0 WHERE scope LIKE 'send:email:minute:%'");
      await requestCode();
    }
    expect(send).toHaveBeenCalledTimes(5);
    database.database.exec("UPDATE auth_limits SET count = 1000 WHERE scope = 'send:global:day'");
    expect((await call('/api/auth/request-code', 'POST', { email: 'guest@example.test' })).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('invalidates the previous code on resend and removes failed deliveries', async () => {
    const { call, requestCode, send, database } = setup();
    const first = await requestCode();
    database.database.exec("UPDATE auth_limits SET expires_at = 0 WHERE scope LIKE 'send:email:minute:%'");
    const second = await requestCode();
    expect((await call('/api/auth/verify-code', 'POST', first)).status).toBe(400);
    expect((await call('/api/auth/verify-code', 'POST', second)).status).toBe(200);
    send.mockResolvedValueOnce(new Response('sensitive provider diagnostic', { status: 503 }));
    const failed = await call('/api/auth/request-code', 'POST', { email: 'guest@example.test' });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('sensitive');
    expect(database.database.prepare('SELECT email FROM auth_codes WHERE email = ?').get('guest@example.test')).toBeUndefined();
  });

  it('revokes logout, expired and removed-allowlist sessions without trusting identity headers', async () => {
    const { call, login, env, database } = setup();
    const owner = await login();
    env.EMAIL_ALLOWED_ADDRESSES = 'guest@example.test';
    expect((await call('/api/projects', 'GET', undefined, owner)).status).toBe(401);
    env.EMAIL_ALLOWED_ADDRESSES = 'owner@example.test,guest@example.test';
    expect((await call('/api/projects', 'GET', undefined, owner)).status).toBe(200);
    const logout = await call('/api/auth/logout', 'POST', {}, owner);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('/api/projects', 'GET', undefined, owner)).status).toBe(401);
    const guest = await login('guest@example.test');
    database.database.exec('UPDATE auth_sessions SET expires_at = 0');
    expect((await call('/api/projects', 'GET', undefined, guest)).status).toBe(401);
    expect((await call('/api/projects', 'GET', undefined, { 'oai-authenticated-user-email': 'owner@example.test', 'x-workbench-account': 'owner@example.test' })).status).toBe(401);
  });

  it('requires same-origin writes and rejects oversized, malformed, unsupported and unknown auth requests', async () => {
    const { call, env } = setup();
    expect((await call('/api/auth/request-code', 'POST', { email: 'owner@example.test' }, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await call('/api/auth/logout', 'POST', {}, { origin: '' })).status).toBe(403);
    expect((await call('/api/auth/request-code', 'POST', { email: 'owner@example.test' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call('/api/auth/request-code', 'POST', { email: 'x'.repeat(5000) })).status).toBe(400);
    expect((await call('/api/auth/request-code', 'POST', { email: 'owner@example.test' }, { 'content-type': 'text/plain' })).status).toBe(400);
    expect((await call('/api/auth/request-code')).status).toBe(405);
    expect((await call('/api/auth/unknown')).status).toBe(404);
    expect((await worker.fetch(new Request('https://workbench.test/api/auth/request-code', { method: 'POST', headers: { origin: 'https://workbench.test', 'content-type': 'application/json' }, body: '{broken' }), env)).status).toBe(400);
  });

  it('isolates list/read/update/delete, including identical project IDs in different accounts', async () => {
    const { call, login } = setup();
    const owner = await login(); const guest = await login('guest@example.test');
    const project = createLedExampleProject(); const path = `/api/projects/${project.id}`;
    const original = await (await call(path, 'PUT', project, owner)).json();
    expect((await call(path, 'GET', undefined, guest)).status).toBe(404);
    expect(await (await call('/api/projects', 'GET', undefined, guest)).json()).toEqual([]);
    expect((await call(path, 'PUT', original, guest)).status).toBe(409);
    expect((await call(path, 'DELETE', undefined, guest)).status).toBe(404);
    expect((await call(path, 'PUT', { ...project, name: 'Separate guest circuit' }, guest)).status).toBe(200);
    expect(await (await call(path, 'GET', undefined, owner)).json()).toEqual(original);
    expect((await call(path, 'DELETE', undefined, guest)).status).toBe(200);
    expect(await (await call(path, 'GET', undefined, owner)).json()).toEqual(original);
    expect((await call(path, 'PUT', original, { ...owner, origin: 'https://evil.test' })).status).toBe(403);
  });

  it('rejects stale tabs after another account signs in instead of copying work between accounts', async () => {
    const { call, login } = setup();
    const guest = await login('guest@example.test');
    const response = await call('/api/projects', 'GET', undefined, { ...guest, 'x-workbench-account': 'owner@example.test' });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('signed-in account changed');
    expect((await call('/api/projects', 'GET', undefined, { cookie: guest.cookie })).status).toBe(409);
  });

  it('copies legacy documents only to the configured verified owner, once, keeping originals intact', async () => {
    const { database, login, call } = setup();
    const legacy = await new D1ProjectRepository(database).save(createLedExampleProject());
    const guest = await login('guest@example.test');
    expect(await (await call('/api/projects', 'GET', undefined, guest)).json()).toEqual([]);
    const owner = await login();
    expect(await (await call(`/api/projects/${legacy.id}`, 'GET', undefined, owner)).json()).toEqual(legacy);
    await call(`/api/projects/${legacy.id}`, 'DELETE', undefined, owner);
    await new AuthStore(database).importLegacyForOwner('owner@example.test');
    expect((await call(`/api/projects/${legacy.id}`, 'GET', undefined, owner)).status).toBe(404);
    expect(await new D1ProjectRepository(database).get(legacy.id)).toEqual(legacy);
  });

  it('fails closed for missing config, invalid modes, missing migrations and provider failures', async () => {
    const { call, env, database } = setup();
    env.AUTH_MODE = 'typo'; expect((await call('/api/projects')).status).toBe(503);
    env.AUTH_MODE = 'email'; env.RESEND_API_KEY = ''; expect((await call('/api/projects')).status).toBe(503);
    env.RESEND_API_KEY = 'test-only-not-a-key'; env.EMAIL_ALLOWED_ADDRESSES = ''; expect((await call('/api/projects')).status).toBe(503);
    env.EMAIL_ALLOWED_ADDRESSES = 'owner@example.test'; database.database.exec('DROP TABLE auth_schema');
    const response = await call('/api/projects'); expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/SQL|table|schema/);
    env.AUTH_MODE = 'sites';
    // The pre-activation private gateway mode also supports Sites' owner test access,
    // which does not forward the optional ChatGPT identity headers.
    expect((await call('/api/projects')).status).toBe(200);
    expect(await (await call('/api/auth/session')).json()).toEqual({ mode: 'sites' });
  });

  it('applies the additive migration to populated old databases without changing their documents', async () => {
    const database = new SqliteD1(':memory:', false); databases.push(database);
    database.database.exec(readFileSync(new URL('../../drizzle/0000_workbench.sql', import.meta.url), 'utf8'));
    const saved = await new D1ProjectRepository(database).save(createLedExampleProject());
    const before = database.database.prepare('SELECT * FROM projects').all();
    database.database.exec(readFileSync(new URL('../../drizzle/0001_email_auth.sql', import.meta.url), 'utf8'));
    expect(database.database.prepare('SELECT * FROM projects').all()).toEqual(before);
    expect(await new D1ProjectRepository(database).get(saved.id)).toEqual(saved);
    await new AuthStore(database).importLegacyForOwner('owner@example.test');
    expect(await new D1ProjectRepository(database, 'owner@example.test').get(saved.id)).toEqual(saved);
  });
});
