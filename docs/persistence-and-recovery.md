# Project persistence, backup, and recovery

Saved workbench projects are versioned documents stored by the local API in SQLite. The current
schema version is exported by `src/domain/project.ts`; older supported documents are migrated and
validated before use. Unsupported future versions are rejected rather than guessed or overwritten.

## Local trust boundary

The server binds to `127.0.0.1` and has no authentication or multi-user authorization. It is intended
for one learner on a local workstation. Do not expose port 8787 to a LAN or the public internet, and
do not place this API behind a public proxy. `PORT` changes only the loopback port; it does not turn
the application into a hosted service.

## Back up projects

1. Save the open project and stop the server so SQLite has closed the database cleanly.
2. Copy `data/workbench.sqlite` to backup storage. If the database was configured with
   `WORKBENCH_DB`, copy that file instead.
3. If any `-wal` or `-shm` companion files remain, keep them with the database copy. Do not copy only
   the main file while the server is running.
4. Keep at least one unchanged backup before running a version that introduces a schema migration.

## Verify or restore a copy

1. Preserve the original database; never test a restore by overwriting the only copy.
2. Point the server at the copied file, for example
   `WORKBENCH_DB=/path/to/restored-workbench.sqlite npm start` after building the application.
3. Open the project list, load representative projects, and verify component placement, instruments,
   simulation settings, and optional PCB state.
4. Stop the verification server before moving or copying the database again.

Migration failures must remain explicit. A recovery change must be tested against a copy of an
existing database and must never silently discard or replace a user's original project.
