CREATE TABLE auth_schema (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO auth_schema VALUES (1, 1);
--> statement-breakpoint
CREATE TABLE auth_codes (
  email TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT UNIQUE NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX auth_codes_expiry ON auth_codes(expires_at);
--> statement-breakpoint
CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE auth_limits (scope TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX auth_limits_expiry ON auth_limits(expires_at);
--> statement-breakpoint
CREATE TABLE account_projects (
  owner_email TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL,
  PRIMARY KEY (owner_email, id)
);
--> statement-breakpoint
CREATE INDEX account_projects_updated ON account_projects(owner_email, updated_at DESC, id);
--> statement-breakpoint
CREATE TABLE auth_legacy_import (id INTEGER PRIMARY KEY CHECK (id = 1), owner_email TEXT NOT NULL);
