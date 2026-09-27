import { projectApi } from './projectApi';
import type { D1Binding } from './d1Types';
import { authenticatedEmail, authJson, emailAuthApi, sameOriginWrite } from './auth/api';
import { emailAuthConfig, type EmailAuthEnvironment } from './auth/config';
import { AuthStore } from './auth/store';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

/** Gateway access remains unchanged until email sign-in is explicitly configured and activated. */
export default {
  async fetch(request: Request, env: EmailAuthEnvironment & { ASSETS: AssetsBinding; DB?: D1Binding }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (env.AUTH_MODE === undefined || env.AUTH_MODE === 'sites') {
        if (url.pathname === '/api/auth/session' && request.method === 'GET') return authJson({ mode: 'sites' });
        // During setup the existing private gateway is the access boundary, including its
        // owner test token. Do not require optional ChatGPT identity headers in this mode.
        // Activate email mode before changing the Sites audience (see docs/email-sign-in.md).
        return projectApi(request, env.DB);
      }
      // A typo, missing secret, missing migration or failed verification must never fall back
      // to the old shared repository after the public email-login mode has been activated.
      if (env.AUTH_MODE !== 'email') return authJson({ error: 'Sign-in is unavailable.' }, 503);
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
        return await projectApi(request, env.DB, email);
      } catch {
        return authJson({ error: 'Sign-in is temporarily unavailable. Please retry.' }, 503);
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !request.headers.get('accept')?.includes('text/html')
      || !['GET', 'HEAD'].includes(request.method)) return response;
    url.pathname = '/index.html';
    url.search = '';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
