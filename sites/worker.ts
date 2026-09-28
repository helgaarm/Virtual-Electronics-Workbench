import { projectApi } from './projectApi';
import type { D1Binding } from './d1Types';
import { authenticatedEmail, authJson, emailAuthApi, sameOriginWrite } from './auth/api';
import { emailAllowlist, emailAuthConfig, normalizeEmail, type EmailAuthEnvironment } from './auth/config';
import { AuthStore } from './auth/store';
import { securityHeaders } from './securityHeaders';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

type Environment = EmailAuthEnvironment & { ASSETS: AssetsBinding; DB?: D1Binding };
// Injected from Vite's compiled index by the Sites build; absent in source-level routing tests.
declare const __SITES_INDEX_HTML__: string;

async function route(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // No default gateway-only mode: removing configuration must never expose shared data.
      if (env.AUTH_MODE !== 'email' && env.AUTH_MODE !== 'sites') return authJson({ error: 'Sign-in is unavailable.' }, 503);
      if (env.AUTH_MODE === 'sites') {
        const allowed = emailAllowlist(env.SITES_ALLOWED_EMAILS);
        if (!allowed || !env.DB) return authJson({ error: 'Sign-in is unavailable.' }, 503);
        // This header is the Sites platform identity contract, not a client account header.
        // Never host this Worker on a direct origin that bypasses Sites dispatch.
        const email = normalizeEmail(request.headers.get('oai-authenticated-user-email'));
        if (!email || !allowed.has(email)) return authJson({ error: 'Sign in to this Site with an approved account.' }, 401);
        if (url.pathname === '/api/auth/session' && request.method === 'GET') return authJson({ mode: 'sites' });
        if (!['GET', 'HEAD'].includes(request.method) && !sameOriginWrite(request)) return authJson({ error: 'Cross-origin writes are not allowed.' }, 403);
        try {
          const store = new AuthStore(env.DB.withSession('first-primary'));
          await store.checkSchema();
          if (!await store.takeLimit(`api:sites:${email}`, 120, Date.now() + 60_000, Date.now())) return authJson({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': '60' });
          return await projectApi(request, env.DB);
        } catch { return authJson({ error: 'Project storage is temporarily unavailable. Please retry.' }, 503); }
      }
      const config = emailAuthConfig(env);
      if (!config || !env.DB) return authJson({ mode: 'email', available: false, error: 'Email sign-in is not configured yet.' }, 503);
      try {
        const store = new AuthStore(env.DB.withSession('first-primary'));
        await store.checkSchema();
        if (url.pathname.startsWith('/api/auth/')) return await emailAuthApi(request, config, store);
        const email = await authenticatedEmail(request, config, store);
        if (!email) return authJson({ error: 'Sign in with your email to access your projects.' }, 401);
        if (request.headers.get('x-workbench-account') !== email) return authJson({ error: 'The signed-in account changed. Keep this work open and sign back in to its account before saving.' }, 409);
        if (!['GET', 'HEAD'].includes(request.method) && !sameOriginWrite(request)) return authJson({ error: 'Cross-origin writes are not allowed.' }, 403);
        if (!await store.takeLimit(`api:email:${email}`, 120, Date.now() + 60_000, Date.now())) return authJson({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': '60' });
        return await projectApi(request, env.DB, email);
      } catch {
        return authJson({ error: 'Sign-in is temporarily unavailable. Please retry.' }, 503);
      }
    }
    // Sites serves matching static assets before invoking this Worker. The build embeds the
    // HTML here and removes its static copy, so document responses always receive our policy.
    if (typeof __SITES_INDEX_HTML__ === 'string' && ['GET', 'HEAD'].includes(request.method)
      && (url.pathname === '/' || url.pathname === '/index.html' || request.headers.get('accept')?.includes('text/html'))) {
      return new Response(request.method === 'HEAD' ? null : __SITES_INDEX_HTML__, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
      });
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !request.headers.get('accept')?.includes('text/html')
      || !['GET', 'HEAD'].includes(request.method)) return response;
    url.pathname = '/index.html';
    url.search = '';
    return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    return securityHeaders(await route(request, env));
  },
};
