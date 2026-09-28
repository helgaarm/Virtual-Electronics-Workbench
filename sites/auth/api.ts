import type { EmailAuthConfig } from './config';
import { normalizeEmail } from './config';
import { authDigest, equalDigest, randomCode, randomToken } from './crypto';
import { sendLoginCode } from './resend';
import { AuthStore } from './store';

const COOKIE = '__Host-workbench-session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const INVALID_CODE = 'Code is invalid or expired. Request a new code and try again.';

function callerAddress(request: Request): string | undefined {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || ip.length > 45) return undefined;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every((part) => part <= 255) ? parts.join('.') : undefined;
  }
  if (!ip.includes(':') || !/^[0-9a-fA-F:.]+$/.test(ip)) return undefined;
  try { return new URL(`http://[${ip}]/`).hostname; }
  catch { return undefined; }
}

export function authJson(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const response = Response.json(value, { status, headers });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export function sameOriginWrite(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin
    && request.headers.get('sec-fetch-site') !== 'cross-site';
}

function sessionToken(request: Request): string | undefined {
  const tokens = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`)).map((part) => part.slice(COOKIE.length + 1));
  return tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0]) ? tokens[0] : undefined;
}

function sessionCookie(token: string, seconds: number): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}

export async function authenticatedEmail(request: Request, config: EmailAuthConfig, store: AuthStore): Promise<string | undefined> {
  const token = sessionToken(request);
  if (!token) return undefined;
  const email = await store.session(await authDigest(config.secret, `session:${token}`), Date.now());
  // Removing an address from the allowlist also revokes its existing sessions at the API boundary.
  return email && config.allowedEmails.has(email) ? email : undefined;
}

async function readBody(request: Request): Promise<Record<string, unknown> | undefined> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return undefined; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

async function requestCode(body: Record<string, unknown>, config: EmailAuthConfig, store: AuthStore): Promise<Response> {
  const email = normalizeEmail(body.email);
  if (!email) return authJson({ error: 'Enter a valid email address.' }, 400);
  const now = Date.now();
  const challengeId = randomToken();
  const accepted = () => authJson({ challengeId, message: 'If this email has access, a code will arrive shortly.', retryAfterSeconds: 60 }, 202);
  if (!config.allowedEmails.has(email)) return accepted();
  const emailHash = await authDigest(config.secret, `email:${email}`);
  if (!await store.takeLimit(`send:email:minute:${emailHash}`, 1, now + 60_000, now)
    || !await store.takeLimit(`send:email:hour:${emailHash}`, 5, now + 3_600_000, now)) return accepted();
  // Only eligible deliveries spend the shared provider budget. Return the same envelope
  // for suppressed mail so budget exhaustion cannot disclose allowlist membership.
  if (!await store.takeLimit('send:global:minute', 20, now + 60_000, now)
    || !await store.takeLimit('send:global:day', 1000, now + 86_400_000, now)) return accepted();
  await store.cleanup(now);
  const code = randomCode();
  await store.putCode(email, challengeId, await authDigest(config.secret, `code:${challengeId}:${code}`), now + 600_000);
  try { await sendLoginCode(config, email, code, challengeId); }
  catch {
    await store.discardCode(challengeId);
    return authJson({ error: 'Code delivery is temporarily unavailable. Try again in a minute.' }, 503);
  }
  return accepted();
}

async function verifyCode(body: Record<string, unknown>, config: EmailAuthConfig, store: AuthStore): Promise<Response> {
  if (typeof body.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(body.challengeId)
    || typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) return authJson({ error: INVALID_CODE }, 400);
  const now = Date.now();
  const attempt = await store.attemptCode(body.challengeId, now);
  const digest = await authDigest(config.secret, `code:${body.challengeId}:${body.code}`);
  if (!attempt || !config.allowedEmails.has(attempt.email) || !equalDigest(attempt.code_hash, digest)
    || !await store.consumeCode(body.challengeId, now)) return authJson({ error: INVALID_CODE }, 400);
  if (attempt.email === config.legacyOwnerEmail) await store.importLegacyForOwner(attempt.email);
  const token = randomToken();
  await store.createSession(await authDigest(config.secret, `session:${token}`), attempt.email, now + SESSION_SECONDS * 1000);
  return authJson({ user: { email: attempt.email } }, 200, { 'set-cookie': sessionCookie(token, SESSION_SECONDS) });
}

export async function emailAuthApi(request: Request, config: EmailAuthConfig, store: AuthStore): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/session' && request.method === 'GET') {
    const email = await authenticatedEmail(request, config, store);
    return authJson({ mode: 'email', available: true, user: email ? { email } : null });
  }
  if (!['/api/auth/request-code', '/api/auth/verify-code', '/api/auth/logout'].includes(path)) return authJson({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return authJson({ error: 'Method not allowed.' }, 405);
  if (!sameOriginWrite(request)) return authJson({ error: 'Cross-origin writes are not allowed.' }, 403);
  if (path !== '/api/auth/logout') {
    // Only use Cloudflare's edge-supplied address; never X-Forwarded-For or a body field.
    const ip = callerAddress(request);
    if (!ip) return authJson({ error: 'Sign-in is temporarily unavailable.' }, 503);
    const now = Date.now();
    const caller = await authDigest(config.secret, `caller:${ip.toLowerCase()}`);
    const action = path.endsWith('/request-code') ? 'request' : 'verify';
    await store.cleanup(now);
    if (!await store.takeLimit(`caller:${action}:minute:${caller}`, action === 'request' ? 20 : 60, now + 60_000, now)
      || !await store.takeLimit(`caller:${action}:hour:${caller}`, action === 'request' ? 100 : 300, now + 3_600_000, now)) {
      return authJson({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': '60' });
    }
  }
  const body = await readBody(request);
  if (!body) return authJson({ error: 'A JSON request of at most 4 KB is required.' }, 400);
  if (path === '/api/auth/request-code') return requestCode(body, config, store);
  if (path === '/api/auth/verify-code') return verifyCode(body, config, store);
  const token = sessionToken(request);
  if (token) await store.revokeSession(await authDigest(config.secret, `session:${token}`));
  return authJson({ signedOut: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}
