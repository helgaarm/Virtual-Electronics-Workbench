export interface EmailAuthEnvironment {
  AUTH_MODE?: string;
  SITES_ALLOWED_EMAILS?: string;
  EMAIL_ALLOWED_ADDRESSES?: string;
  LEGACY_PROJECT_OWNER_EMAIL?: string;
  EMAIL_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
}

export interface EmailAuthConfig {
  allowedEmails: ReadonlySet<string>;
  legacyOwnerEmail?: string;
  secret: string;
  resendApiKey: string;
  from: string;
}

export function emailAllowlist(value: string | undefined): ReadonlySet<string> | undefined {
  const emails = value?.split(',').map(normalizeEmail);
  if (!emails?.length || emails.some((email) => !email)) return undefined;
  return new Set(emails.filter((email): email is string => email !== undefined));
}

/** Canonical account identity; no display names, control characters or multiple recipients. */
export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return undefined;
  const local = email.split('@')[0];
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return undefined;
  return email;
}

export function emailAuthConfig(env: EmailAuthEnvironment): EmailAuthConfig | undefined {
  const emails = env.EMAIL_ALLOWED_ADDRESSES?.split(',').map(normalizeEmail);
  const from = normalizeEmail(env.AUTH_EMAIL_FROM);
  const legacyOwnerEmail = env.LEGACY_PROJECT_OWNER_EMAIL ? normalizeEmail(env.LEGACY_PROJECT_OWNER_EMAIL) : undefined;
  if (!emails?.length || emails.some((email) => !email) || !from
    || !env.EMAIL_AUTH_SECRET || env.EMAIL_AUTH_SECRET.length < 32
    || !env.RESEND_API_KEY?.trim() || /[\r\n]/.test(env.RESEND_API_KEY)
    || (env.LEGACY_PROJECT_OWNER_EMAIL && !legacyOwnerEmail)) return undefined;
  const allowedEmails = new Set(emails.filter((email): email is string => email !== undefined));
  return { allowedEmails, legacyOwnerEmail, secret: env.EMAIL_AUTH_SECRET, resendApiKey: env.RESEND_API_KEY, from };
}
