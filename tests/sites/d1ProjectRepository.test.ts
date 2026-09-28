import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLedExampleProject, PROJECT_SCHEMA_VERSION } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
import { ProjectConflictError } from '../../src/persistence/projectErrors';
import { D1ProjectRepository } from '../../sites/d1ProjectRepository';
import { SqliteD1 } from './sqliteD1';

const databases: SqliteD1[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));
function setup() {
  const database = new SqliteD1();
  databases.push(database);
  return { database, repository: new D1ProjectRepository(database) };
}

describe('Sites D1 persistence', () => {
  it.each(['switched-led', 'rc-charge-discharge', 'nano-blink', 'wind-constant-temperature'] as const)('preserves the complete %s project', async (id) => {
    const { database, repository } = setup();
    const project = createStarterProject(id);
    const saved = await repository.save(project);
    expect(saved).toEqual({ ...project, revision: 1 });
    expect(await new D1ProjectRepository(database).get(project.id)).toEqual(saved);
    expect(await repository.list()).toEqual([{ id: saved.id, name: saved.name, createdAt: saved.createdAt, updatedAt: saved.updatedAt }]);
  });

  it('allows only one concurrent creation or stale-tab update', async () => {
    const { database, repository } = setup();
    const otherDevice = new D1ProjectRepository(database);
    const original = createLedExampleProject();
    for (const project of [original, { ...original, revision: 1 }]) {
      const results = await Promise.allSettled([
        repository.save({ ...project, name: 'Device A' }),
        otherDevice.save({ ...project, name: 'Device B' }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')?.reason).toBeInstanceOf(ProjectConflictError);
    }
    expect((await repository.get(original.id))?.revision).toBe(2);
  });

  it('preserves creation time, handles missing IDs, and refuses stale resurrection', async () => {
    const { repository } = setup();
    const project = await repository.save(createLedExampleProject());
    expect(await repository.get('missing')).toBeUndefined();
    const saved = await repository.save({ ...project, name: 'Renamed', createdAt: '2000-01-01T00:00:00.000Z' });
    expect(saved.createdAt).toBe(project.createdAt);
    expect(await repository.remove(saved.id)).toBe(true);
    expect(await repository.remove(saved.id)).toBe(false);
    await expect(repository.save(saved)).rejects.toBeInstanceOf(ProjectConflictError);
  });

  it('migrates older projects, rejecting future or corrupted documents without replacing them', async () => {
    const { database, repository } = setup();
    const original = await repository.save(createLedExampleProject());
    for (const version of [12, 13, 14]) {
      database.database.prepare('UPDATE projects SET document = ? WHERE id = ?').run(JSON.stringify({ ...original, version }), original.id);
      expect((await repository.get(original.id))?.version).toBe(PROJECT_SCHEMA_VERSION);
    }
    for (const document of [JSON.stringify({ ...original, version: PROJECT_SCHEMA_VERSION + 1 }), '{bad']) {
      database.database.prepare('UPDATE projects SET document = ? WHERE id = ?').run(document, original.id);
      await expect(repository.save(original)).rejects.toThrow();
      expect(database.database.prepare('SELECT document FROM projects WHERE id = ?').get(original.id)?.document).toBe(document);
    }
  });

  it('rejects a newer database schema before writing', async () => {
    const { database, repository } = setup();
    database.database.exec('UPDATE workbench_schema SET version = 2');
    await expect(repository.save(createLedExampleProject())).rejects.toThrow(/Unsupported Sites database schema/);
    expect(database.database.prepare('SELECT count(*) AS count FROM projects').get()?.count).toBe(0);
  });

  it('uses bound parameters for hostile-looking IDs and names', async () => {
    const { repository } = setup();
    const maliciousId = "x'; DROP TABLE projects; --";
    await expect(repository.save({ ...createLedExampleProject(), id: maliciousId })).rejects.toThrow(/safe identifier/);
    expect(await repository.get(maliciousId)).toBeUndefined();
    const project = { ...createLedExampleProject(), name: "x'; DROP TABLE projects; -- <script>alert(1)</script>" };
    const saved = await repository.save(project);
    expect(await repository.get(project.id)).toEqual(saved);
    expect(await repository.list()).toHaveLength(1);
  });

  it('survives reopening storage without rerunning or downgrading migrations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sites-d1-test-'));
    const file = join(directory, 'test.sqlite');
    let database = new SqliteD1(file);
    try {
      const saved = await new D1ProjectRepository(database).save(createLedExampleProject());
      database.close();
      database = new SqliteD1(file, false);
      expect(await new D1ProjectRepository(database).get(saved.id)).toEqual(saved);
    } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
