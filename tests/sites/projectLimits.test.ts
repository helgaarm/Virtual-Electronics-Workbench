import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { D1ProjectRepository, MAX_SITES_ACCOUNT_BYTES, MAX_SITES_PROJECTS, ProjectQuotaExceededError } from '../../sites/d1ProjectRepository';
import { projectApi } from '../../sites/projectApi';
import { ApiProjectRepository } from '../../src/persistence/apiProjectRepository';
import { AuthStore } from '../../sites/auth/store';
import { SqliteD1 } from './sqliteD1';

const databases: SqliteD1[] = [];
afterEach(() => { vi.unstubAllGlobals(); databases.splice(0).forEach((db) => db.close()); });
function setup() {
  const db = new SqliteD1(); databases.push(db);
  return { db, repo: new D1ProjectRepository(db, 'owner@example.test') };
}
function insert(db: SqliteD1, id: string, paddingBytes = 0, account = 'owner@example.test') {
  const project = { ...createLedExampleProject(), id, name: 'Circuit æøå', revision: 1 };
  const document = JSON.stringify(project) + ' '.repeat(paddingBytes);
  db.database.prepare('INSERT INTO account_projects VALUES (?, ?, ?, ?, ?, ?)')
    .run(account, id, project.name, project.createdAt, project.updatedAt, document);
  return project;
}
function usage(db: SqliteD1, scope = 'owner@example.test') {
  const actual = db.database.prepare('SELECT count(*) AS project_count, coalesce(sum(length(CAST(document AS BLOB))), 0) AS document_bytes FROM account_projects WHERE owner_email = ?').get(scope);
  expect(db.database.prepare('SELECT project_count, document_bytes FROM project_storage_usage WHERE scope = ?').get(scope)).toEqual(actual);
}

describe('Sites storage quotas and pagination', () => {
  it('atomically bounds creation across devices and isolates account budgets', async () => {
    const { db, repo } = setup();
    for (let i = 0; i < MAX_SITES_PROJECTS - 1; i++) insert(db, `existing-${i}`);
    const results = await Promise.allSettled(['a', 'b'].map((id) => new D1ProjectRepository(db, 'owner@example.test').save({ ...createLedExampleProject(), id })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.reason).toBeInstanceOf(ProjectQuotaExceededError);
    expect(await repo.list()).toHaveLength(MAX_SITES_PROJECTS);
    await expect(new D1ProjectRepository(db, 'guest@example.test').save(createLedExampleProject())).resolves.toMatchObject({ revision: 1 });
    const existing = (await repo.get('existing-0'))!;
    await expect(repo.save({ ...existing, name: 'Renamed' })).resolves.toMatchObject({ revision: 2 });
    await repo.remove('existing-1');
    await expect(repo.save({ ...createLedExampleProject(), id: 'replacement' })).resolves.toMatchObject({ revision: 1 });
    usage(db); usage(db, 'guest@example.test');
  });

  it('enforces UTF-8 byte capacity and returns an actionable API error without losing work', async () => {
    const { db, repo } = setup();
    const next = createLedExampleProject();
    const nextBytes = new TextEncoder().encode(JSON.stringify({ ...next, revision: 1 })).byteLength;
    // Real persisted JSON with legal whitespace, spread across rows below the per-row cap.
    const target = MAX_SITES_ACCOUNT_BYTES - nextBytes + 1;
    for (let i = 0; i < 27; i++) {
      const count = Math.floor(target / 27) + (i < target % 27 ? 1 : 0);
      const row = insert(db, `large-${i}`);
      const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
      db.database.prepare('UPDATE account_projects SET document = ? WHERE owner_email = ? AND id = ?')
        .run(JSON.stringify(row) + ' '.repeat(count - bytes), 'owner@example.test', row.id);
    }
    usage(db);
    const response = await projectApi(new Request(`https://example.test/api/projects/${next.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next),
    }), db, 'owner@example.test');
    expect(response.status).toBe(507); expect(await response.text()).toContain('Export and delete');
    expect(await repo.get(next.id)).toBeUndefined();
    const reduced = await repo.save((await repo.get('large-0'))!);
    expect(reduced.revision).toBe(2);
    await expect(repo.save(next)).resolves.toMatchObject({ revision: 1 });
    await repo.remove('large-1'); usage(db);
  });

  it('keeps large legacy collections recoverable and copies them with consistent accounting', async () => {
    const db = new SqliteD1(':memory:', false); databases.push(db);
    for (const migration of ['0000_workbench', '0001_email_auth']) db.database.exec(readFileSync(new URL(`../../drizzle/${migration}.sql`, import.meta.url), 'utf8'));
    for (let i = 0; i < 105; i++) {
      const project = { ...createLedExampleProject(), id: `legacy-${String(i).padStart(3, '0')}`, name: 'æøå', revision: 1 };
      db.database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)').run(project.id, project.name, project.createdAt, project.updatedAt, JSON.stringify(project));
    }
    const before = db.database.prepare('SELECT * FROM projects ORDER BY id').all();
    insert(db, 'preexisting', 10, 'existing@example.test');
    const accountBefore = db.database.prepare('SELECT * FROM account_projects').all();
    db.database.exec(readFileSync(new URL('../../drizzle/0002_project_storage.sql', import.meta.url), 'utf8'));
    expect(db.database.prepare('SELECT * FROM projects ORDER BY id').all()).toEqual(before);
    expect(db.database.prepare('SELECT * FROM account_projects').all()).toEqual(accountBefore);
    usage(db, 'existing@example.test');
    await new AuthStore(db).importLegacyForOwner('owner@example.test');
    const repo = new D1ProjectRepository(db, 'owner@example.test');
    expect(await repo.list()).toHaveLength(105); usage(db);
    await expect(repo.save(createLedExampleProject())).rejects.toBeInstanceOf(ProjectQuotaExceededError);
    await expect(repo.save({ ...(await repo.get('legacy-000'))!, name: 'x' })).resolves.toMatchObject({ name: 'x' });
    await repo.remove('legacy-001'); usage(db);
    // A rolled-back SQL transaction must roll back usage too.
    const tracked = db.database.prepare('SELECT * FROM project_storage_usage ORDER BY scope').all();
    db.database.exec('BEGIN');
    await repo.remove('legacy-002');
    db.database.exec('ROLLBACK');
    expect(db.database.prepare('SELECT * FROM project_storage_usage ORDER BY scope').all()).toEqual(tracked);
  });

  it('paginates tied timestamps without dropping projects and keeps cursors account-scoped', async () => {
    const { db, repo } = setup();
    for (let i = 0; i < 105; i++) insert(db, `page-${String(i).padStart(3, '0')}`);
    db.database.exec("UPDATE account_projects SET updated_at = '2026-09-28T00:00:00.000Z'");
    const first = await repo.listPage();
    expect(first.projects).toHaveLength(50);
    expect((await new D1ProjectRepository(db, 'guest@example.test').listPage(first.nextCursor)).projects).toEqual([]);
    vi.stubGlobal('fetch', async (url: string) => projectApi(new Request(`https://example.test${url}`), db, 'owner@example.test'));
    const all = await new ApiProjectRepository('/api/projects', 'sites').list();
    expect(all).toHaveLength(105); expect(new Set(all.map((project) => project.id)).size).toBe(105);
    for (const cursor of ['bad!', btoa('{}'), 'a'.repeat(513)]) {
      expect((await projectApi(new Request(`https://example.test/api/projects?after=${encodeURIComponent(cursor)}`), db, 'owner@example.test')).status).toBe(400);
    }
  });
});
