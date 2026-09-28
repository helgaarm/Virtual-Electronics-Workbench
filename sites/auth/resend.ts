import type { EmailAuthConfig } from './config';

export async function sendLoginCode(config: EmailAuthConfig, email: string, code: string, challengeId: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `workbench-login-${challengeId}`,
    },
    body: JSON.stringify({
      from: `Virtual Electronics Workbench <${config.from}>`,
      to: [email],
      subject: 'Your Workbench sign-in code',
      text: `Your sign-in code is ${code}.\n\nIt expires in 10 minutes and can be used once.\nDo not share this code. If you did not request it, ignore this email.`,
    }),
  });
  // Provider diagnostics can contain addresses and message data. Never expose or log them.
  await response.body?.cancel();
  if (!response.ok) throw new Error('Email delivery unavailable.');
}
