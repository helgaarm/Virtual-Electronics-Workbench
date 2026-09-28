import type { D1Session } from '../d1Types';

export class AuthStore {
  constructor(private readonly database: D1Session) {}

  async checkSchema(): Promise<void> {
    const row = await this.database.prepare('SELECT version FROM auth_schema WHERE id = 1').first<{ version: number }>();
    if (row?.version !== 1) throw new Error('Unsupported authentication schema.');
  }

  async takeLimit(scope: string, maximum: number, expiresAt: number, now: number): Promise<boolean> {
    const row = await this.database.prepare(`INSERT INTO auth_limits(scope, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(scope) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
      WHERE expires_at <= ? OR count < ? RETURNING count`)
      .bind(scope, expiresAt, now, now, now, maximum).first<{ count: number }>();
    return row !== null;
  }

  async cleanup(now: number): Promise<void> {
    // Bounded, indexed cleanup; no scans or deletion of still-valid sessions.
    await this.database.batch([
      this.database.prepare('DELETE FROM auth_codes WHERE email IN (SELECT email FROM auth_codes WHERE expires_at <= ? LIMIT 100)').bind(now),
      this.database.prepare('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at <= ? LIMIT 100)').bind(now),
      this.database.prepare('DELETE FROM auth_limits WHERE scope IN (SELECT scope FROM auth_limits WHERE expires_at <= ? LIMIT 100)').bind(now),
    ]);
  }

  async putCode(email: string, challengeId: string, digest: string, expiresAt: number): Promise<void> {
    await this.database.prepare(`INSERT INTO auth_codes(email, challenge_id, code_hash, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET challenge_id = excluded.challenge_id, code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, attempts = 0, consumed_at = NULL`).bind(email, challengeId, digest, expiresAt).run();
  }

  async discardCode(challengeId: string): Promise<void> {
    await this.database.prepare('DELETE FROM auth_codes WHERE challenge_id = ?').bind(challengeId).run();
  }

  async attemptCode(challengeId: string, now: number): Promise<{ email: string; code_hash: string } | null> {
    return this.database.prepare(`UPDATE auth_codes SET attempts = attempts + 1
      WHERE challenge_id = ? AND expires_at > ? AND consumed_at IS NULL AND attempts < 5
      RETURNING email, code_hash`).bind(challengeId, now).first();
  }

  async consumeCode(challengeId: string, now: number): Promise<boolean> {
    const row = await this.database.prepare(`UPDATE auth_codes SET consumed_at = ?
      WHERE challenge_id = ? AND expires_at > ? AND consumed_at IS NULL RETURNING email`)
      .bind(now, challengeId, now).first();
    return row !== null;
  }

  async createSession(tokenHash: string, email: string, expiresAt: number): Promise<void> {
    await this.database.prepare('INSERT INTO auth_sessions(token_hash, email, expires_at) VALUES (?, ?, ?)')
      .bind(tokenHash, email, expiresAt).run();
  }

  async session(tokenHash: string, now: number): Promise<string | undefined> {
    const row = await this.database.prepare('SELECT email FROM auth_sessions WHERE token_hash = ? AND expires_at > ?')
      .bind(tokenHash, now).first<{ email: string }>();
    return row?.email;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  async importLegacyForOwner(email: string): Promise<void> {
    // Both writes commit together. The original shared documents remain intact for recovery.
    await this.database.batch([
      this.database.prepare(`INSERT INTO account_projects(owner_email, id, name, created_at, updated_at, document)
        SELECT ?, id, name, created_at, updated_at, document FROM projects
        WHERE NOT EXISTS (SELECT 1 FROM auth_legacy_import WHERE id = 1)
        ON CONFLICT(owner_email, id) DO NOTHING`).bind(email),
      this.database.prepare('INSERT INTO auth_legacy_import(id, owner_email) VALUES (1, ?) ON CONFLICT(id) DO NOTHING').bind(email),
    ]);
  }
}
