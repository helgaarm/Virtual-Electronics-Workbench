# Sites and local editions

The same codebase runs in two independent environments:

| Environment | Frontend | Backend | Durable project storage |
| --- | --- | --- | --- |
| Sites | React / Three.js | Sites Worker, `/api/projects` | Sites-managed Cloudflare D1, binding `DB` |
| Local | React / Three.js | Loopback Express, `/api/projects` | `data/workbench.sqlite` |

The Site stays restricted. The Sites gateway protects pages, and the Worker independently requires
an explicit authentication mode on every API request. In `sites` mode it checks the
platform-authenticated email against `SITES_ALLOWED_EMAILS`; absent identity or configuration is
denied even if the audience is later made public. Owner test access without identity is denied.
Do not publish the Worker separately or change the audience without reviewing access to the
database. The Site currently has one owner and one shared project collection for its authorized
audience while gateway sign-in is active. Email sign-in with separate per-user projects is
implemented but requires Resend setup and explicit activation; see [email sign-in](email-sign-in.md).

Circuit extraction, simulation, instruments, and rendering run in the browser in both editions.
Only project persistence needs the backend. No local database, credentials, or environment files
are included in deployment. Sites projects are available across devices after signing into the
same private Site; browser data is no longer the authoritative project store.

## Run locally, including without internet

Install dependencies once with `npm install`, then use `npm run dev` and open
`http://127.0.0.1:5173`. For a production build, run `npm run build` followed by `npm start`, then
open `http://127.0.0.1:8787`. Once dependencies are installed, both workflows use local code and
storage and require no connection to Sites. The API continues to bind only to `127.0.0.1`.
`WORKBENCH_DB` and `PORT` retain their existing meanings.

Local and Sites databases are intentionally independent. Local changes do not automatically
upload to Sites, and Sites changes do not overwrite local projects. The complete project JSON
format and its version migrations remain the same. The local SQLite schema is unchanged.

## Recover browser projects from the first Sites edition

If this browser has projects from the original IndexedDB edition, the app displays
**Copy browser projects to Sites**. This copies complete documents, preserves project IDs when
available, and keeps the originals in IndexedDB. If an ID already contains different cloud work,
the import creates a separate copy with a deterministic ID. Retrying or importing in two tabs
does not duplicate successful copies. Partial failures are shown and can be retried.

This recovery feature is only visible when browser projects exist. Do not clear site data until
the desired projects have been copied and reopened from Sites. IndexedDB is not used as a silent
fallback when the cloud API is unavailable.

## Database schema, concurrency, and migrations

The initial D1 migration is `drizzle/0000_workbench.sql`, tracked by
`drizzle/meta/_journal.json` and packaged under `dist/.openai/drizzle`. Sites applies the migration
at deployment. It creates a version guard (`workbench_schema`) and a `projects` table with the
same document and summary columns as local SQLite. Do not edit an applied migration: add a new
forward migration, update the supported schema version, and test old data and rollback behavior.
The Worker refuses unsupported database versions and never initializes or drops tables on requests.

Each API request starts a D1 session at the primary to avoid stale reads. Saves validate the full
incoming and existing documents, compare revisions, then use a conditional SQL write against the
exact previous document. The comparison is part of the write, so simultaneous requests cannot
both overwrite the same revision. Inserts are also conditional; stale saves cannot recreate a
deleted project. Parameter binding protects query values. Future and malformed stored documents
are not overwritten.

Requests are limited to 2 MiB while streaming. Stored project JSON is limited to 1,900,000 bytes
to leave room for summary columns within D1's 2,000,000-byte row limit. Oversized saves report an
error; no project is truncated. API responses are not cached, cross-origin writes are rejected,
and unexpected errors do not reveal SQL or provider diagnostics.

### Capacity and browser protection

`drizzle/0002_project_storage.sql` adds usage accounting without changing existing documents.
The migration backfills counters once; indexed account lookups and transactional triggers maintain
them afterwards, avoiding repeated document scans on saves. Conditional SQL writes atomically
enforce 100 projects and 50,000,000 document bytes per account (or for the shared collection in
`sites` mode), including simultaneous saves. UTF-8 bytes are counted, not JavaScript characters.
Quota errors return 507 with an export/delete/reduce message. Existing collections above the limits
remain readable and deletable; non-growing updates remain possible. The one-time legacy owner copy
preserves the entire collection even above the quota, and updates counters transactionally.

Project lists use 50-row keyset pages with an `x-next-project-cursor` header. The browser follows
`?after=` cursors without changing the local API contract; repeated cursors and lists above 10,000
entries produce an explicit error rather than a partial list. Administrative recovery of larger
legacy collections should use paginated exports. Concurrent modifications can change list ordering;
reload the list after saving on another device. Reads and writes share a per-account API limit of
120 requests per minute; retry a 429 response after its `Retry-After` interval.

All Worker responses include Content Security Policy, nosniff, no-referrer, Permissions Policy and
HSTS. The Sites build embeds the compiled HTML in the Worker and removes the static index file,
so the platform cannot serve the document without its security headers. JS/CSS remain static
assets. Scripts and network requests are restricted to the same origin; inline scripts/eval are
disallowed. Inline styles remain enabled for React/Three.js positioning, and data/blob images and
same-origin/blob workers support schematics, exports and circuit work. Framing is allowed only by
the same origin and `https://chatgpt.com` for the Sites preview, not arbitrary websites. If another
official preview origin is needed, review it explicitly rather than adding a wildcard.

For migration recovery, retain the original documents and repair counters forward if necessary.
Do not drop tables or deploy the pre-hardening Worker as an authentication recovery mechanism.
The local SQLite schema and offline behavior remain independent of these Sites limits.

## Build and publish

Run `npm run check`, then `npm run build:sites`. The Sites build emits `dist/client`,
`dist/server/index.js`, and `dist/.openai` including hosting metadata and migrations. The browser
distribution includes MIT and third-party license notices. A Sites build is for the Sites runtime;
use the standard build/start commands for the local Express edition.

Reuse the exact `project_id` in `.openai/hosting.json`, with `"d1": "DB"`. Push the tested source
to the existing Site's source branch and build that exact commit. Package `.openai` and `dist`
at the archive root, for example `tar -cf deployment.tar .openai dist`; do not flatten `dist`.
Save and deploy through Sites, preserving the current audience. Check authenticated `/api/health` and project
save/open behavior after deployment, not just the frontend URL.

## Backup and recovery

Local recovery is described in [persistence and recovery](persistence-and-recovery.md). For Sites,
retain complete project JSON records before migrations and verify that backups can be loaded with
the matching application version. The authenticated API returns complete records; the Sites database
viewer provides read-only inspection. Do not put backups in published static assets or Git.

Keep the existing D1 binding and Site project ID across deployments. Reverting the frontend or
Worker does not revert database changes. Use an additive forward repair for schema problems;
never drop the database or replace it with a fresh one to make a deployment pass. The prior
browser-only Site version does not read D1, so deploying that version is not a D1 recovery path.

## References

- [Official Sites configuration and storage](https://learn.chatgpt.com/docs/sites)
- [Official Sites artifact and migration packaging](https://github.com/openai/sites/tree/main/packages/sites-vite-plugin)
- [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [D1 size limits](https://developers.cloudflare.com/d1/platform/limits/)
