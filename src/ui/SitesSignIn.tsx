import { useEffect, useState } from 'react';
import App from '../App';
import './sitesSignIn.css';

type Session = { mode: 'sites' } | { mode: 'email'; user: { email: string } | null };

async function authRequest(path: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/auth/${path}`, {
    credentials: 'same-origin',
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sign-in is temporarily unavailable. Please retry.');
  const data = value as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Sign-in failed. Please retry.');
  return data;
}

function responseEmail(value: unknown): string {
  if (!value || typeof value !== 'object' || !('email' in value) || typeof value.email !== 'string') throw new Error('Invalid sign-in response. Please retry.');
  return value.email;
}

export function SitesSignIn() {
  const [session, setSession] = useState<Session>();
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void authRequest('session').then((value) => {
      if (!active) return;
      if (value.mode === 'sites') setSession({ mode: 'sites' });
      else if (value.mode === 'email') setSession({ mode: 'email', user: value.user ? { email: responseEmail(value.user) } : null });
      else throw new Error('Sign-in is temporarily unavailable. Please retry.');
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Sign-in unavailable.'); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setSecondsRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const requestCode = async () => {
    setBusy(true); setError('');
    try {
      const value = await authRequest('request-code', { email });
      if (typeof value.challengeId !== 'string') throw new Error('Could not request a code. Please retry.');
      setChallengeId(value.challengeId); setCode('');
      setMessage('If this email has access, a code will arrive shortly. Check your inbox and spam folder.');
      setRetryAt(Date.now() + 60_000); setSecondsRemaining(60);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not request a code.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError('');
    try {
      const value = await authRequest('verify-code', { challengeId, code });
      setSession({ mode: 'email', user: { email: responseEmail(value.user) } });
      setCode(''); setChallengeId(''); setMessage('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not verify the code.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    if (!window.confirm('Save any changes before signing out. Sign out now?')) return;
    setBusy(true); setError('');
    try {
      await authRequest('logout', {});
      setSession({ mode: 'email', user: null }); setEmail(''); setChallengeId(''); setCode('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not sign out. Please retry.'); }
    finally { setBusy(false); }
  };

  if (session?.mode === 'sites') return <App />;
  if (session?.user) return <div className="signed-in-sites">
    <div className="sites-account-bar">
      <span title={session.user.email}>{session.user.email}</span>
      {error && <span role="alert">{error}</span>}
      <button type="button" disabled={busy} onClick={() => void logout()}>Sign out</button>
    </div>
    <App key={session.user.email} accountEmail={session.user.email} />
  </div>;

  return <main className="sites-sign-in">
    <section className="sites-sign-in-card" aria-labelledby="sign-in-title">
      <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
      <p className="sign-in-brand">Virtual Electronics Workbench</p>
      <h1 id="sign-in-title">Sign in with email</h1>
      <p>Your circuits, ready when you return. Use an email address that has been given access.</p>
      {!session ? <>
        {!error && <p role="status">Checking sign-in…</p>}
        {error && <button type="button" onClick={() => { setError(''); setReload((value) => value + 1); }}>Retry</button>}
      </> : <form onSubmit={(event) => { event.preventDefault(); void (challengeId ? verify() : requestCode()); }}>
        <label htmlFor="sign-in-email">Email address</label>
        <input id="sign-in-email" name="email" type="email" autoComplete="email" maxLength={254} required
          value={email} disabled={busy || Boolean(challengeId)} onChange={(event) => setEmail(event.target.value)} />
        {challengeId && <>
          <label htmlFor="sign-in-code">8-digit code</label>
          <input id="sign-in-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}"
            aria-describedby="sign-in-code-help" minLength={8} maxLength={8} required autoFocus disabled={busy}
            value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))} />
          <small id="sign-in-code-help">The code expires after 10 minutes and works once.</small>
        </>}
        <button className="sign-in-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : challengeId ? 'Sign in' : 'Send code'}</button>
        {challengeId && <div className="sign-in-secondary">
          <button type="button" disabled={busy || secondsRemaining > 0} onClick={() => void requestCode()}>{secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : 'Send a new code'}</button>
          <button type="button" disabled={busy} onClick={() => { setChallengeId(''); setCode(''); setMessage(''); setError(''); }}>Change email</button>
        </div>}
      </form>}
      {message && <p role="status">{message}</p>}
      {error && <p className="sign-in-error" role="alert">{error}</p>}
      <p className="sign-in-footnote">No password or ChatGPT account needed.</p>
    </section>
  </main>;
}
