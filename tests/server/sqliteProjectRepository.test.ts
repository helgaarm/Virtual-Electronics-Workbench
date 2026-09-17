import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createLedExampleProject, PROJECT_SCHEMA_VERSION } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
import { GPIO_SERIAL_ADC_HEX } from '../fixtures/nanoFirmware';
import { createApp } from '../../server/app';
import { ProjectConflictError, SqliteProjectRepository } from '../../server/sqliteProjectRepository';

describe('SQLite project persistence', () => {
  const repositories: SqliteProjectRepository[] = [];
  afterEach(() => repositories.splice(0).forEach((repository) => repository.close()));

  function repository(): SqliteProjectRepository {
    const value = new SqliteProjectRepository(':memory:');
    repositories.push(value);
    return value;
  }

  it.each(['nano-blink', 'nano-button', 'nano-analog', 'wind-constant-power', 'wind-constant-temperature'] as const)('round-trips the %s program and all 30 pins through SQLite and HTTP', async (id) => {
    const repo = repository();
    const app = createApp(repo);
    const project = createStarterProject(id);
    const saved = await request(app).put(`/api/projects/${project.id}`).send(project).expect(200);
    const loaded = await request(app).get(`/api/projects/${project.id}`).expect(200);
    expect(loaded.body.components).toEqual(project.components);
    expect(loaded.body.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(loaded.body.revision).toBe(saved.body.revision);
  });

  it.each([12, 13, 14])('opens and upgrades a copy of a schema-%i database while preserving the recovery original', (version) => {
    const directory = mkdtempSync(join(tmpdir(), 'vew-nano-migration-'));
    const original = join(directory, 'original.sqlite');
    const copy = join(directory, 'copy.sqlite');
    const legacy = { ...createStarterProject(version >= 13 ? 'nano-blink' : 'switched-led'), version, revision: 1 };
    let repo: SqliteProjectRepository | undefined;
    try {
      repo = new SqliteProjectRepository(original); repo.close(); repo = undefined;
      const db = new DatabaseSync(original);
      try { db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)').run(legacy.id, legacy.name, legacy.createdAt, legacy.updatedAt, JSON.stringify(legacy)); }
      finally { db.close(); }
      const before = readFileSync(original);
      copyFileSync(original, copy);
      repo = new SqliteProjectRepository(copy);
      const loaded = repo.get(legacy.id)!;
      expect(loaded).toEqual({ ...legacy, version: PROJECT_SCHEMA_VERSION });
      expect(repo.save(loaded).revision).toBe(2);
      repo.close(); repo = undefined;
      expect(readFileSync(original)).toEqual(before);
      repo = new SqliteProjectRepository(original);
      expect(repo.get(legacy.id)?.revision).toBe(1);
    } finally { repo?.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('persists custom Nano firmware and refuses invalid replacements without losing the saved program', async () => {
    const repo = repository(); const app = createApp(repo);
    const project = createStarterProject('nano-blink');
    project.components = project.components.map((part) => part.kind === 'arduino-nano' ? { ...part, programId: 'custom', firmware: { name: 'user.hex', hex: GPIO_SERIAL_ADC_HEX } } : part);
    const saved = (await request(app).put(`/api/projects/${project.id}`).send(project).expect(200)).body;
    expect((await request(app).get(`/api/projects/${project.id}`).expect(200)).body.components).toEqual(project.components);
    await request(app).put(`/api/projects/${project.id}`).send({ ...saved, components: project.components.map((part) => part.kind === 'arduino-nano' ? { ...part, firmware: { name: 'bad.hex', hex: ':bad' } } : part) }).expect(400);
    expect(repo.get(project.id)?.components).toEqual(project.components);
  });

  it('round-trips, lists, updates and deletes a complete project', () => {
    const repo = repository();
    const project = createLedExampleProject();
    const saved = repo.save(project);
    expect(saved.revision).toBe(1);
    expect(repo.get(project.id)).toEqual(saved);
    expect(repo.list()).toEqual([
      { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt },
    ]);
    repo.save({ ...saved, name: 'Renamed' });
    expect(repo.get(project.id)?.name).toBe('Renamed');
    expect(repo.remove(project.id)).toBe(true);
    expect(repo.get(project.id)).toBeUndefined();
  });

  it('rejects stale revisions instead of overwriting newer work', () => {
    const repo = repository();
    const project = createLedExampleProject();
    const first = repo.save(project);
    const second = repo.save({ ...first, name: 'Newest copy' });
    expect(() => repo.save({ ...first, name: 'Stale copy' })).toThrow(ProjectConflictError);
    expect(repo.get(project.id)).toEqual(second);
  });

  it('persists a project across real SQLite connections', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vew-sqlite-'));
    const filename = join(directory, 'projects.sqlite');
    const project = createLedExampleProject();
    let writer: SqliteProjectRepository | undefined;
    let reader: SqliteProjectRepository | undefined;
    try {
      writer = new SqliteProjectRepository(filename);
      const saved = writer.save(project);
      writer.close();
      writer = undefined;
      reader = new SqliteProjectRepository(filename);
      expect(reader.get(project.id)).toEqual(saved);
    } finally {
      writer?.close();
      reader?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('round-trips configured Phase E instruments through SQLite and HTTP', async () => {
    const repo = repository();
    const app = createApp(repo);
    const project = createStarterProject('rc-charge-discharge');
    const saved = await request(app)
      .put(`/api/projects/${project.id}`)
      .send(project)
      .expect(200);
    const reopened = await request(app).get(`/api/projects/${project.id}`).expect(200);
    expect(reopened.body.oscilloscope).toEqual(project.oscilloscope);
    expect(reopened.body.signalGenerator).toEqual(project.signalGenerator);
    expect(reopened.body.simulation).toEqual(project.simulation);
    expect(reopened.body.revision).toBe(saved.body.revision);
  });

  it('exposes health and project CRUD over HTTP', async () => {
    const repo = repository();
    const app = createApp(repo);
    const project = createLedExampleProject();
    await request(app).get('/api/health').expect(200, {
      status: 'ok',
      storage: 'sqlite',
      projectSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
    await request(app).put(`/api/projects/${project.id}`).send(project).expect(200);
    const response = await request(app).get(`/api/projects/${project.id}`).expect(200);
    expect(response.body.name).toBe('Light an LED');
    await request(app).delete(`/api/projects/${project.id}`).expect(200, { deleted: true });
    await request(app).get(`/api/projects/${project.id}`).expect(404);
  });

  it('returns safe client errors for malformed and invalid nested documents', async () => {
    const repo = repository();
    const app = createApp(repo);
    const project = createLedExampleProject();
    await request(app)
      .put(`/api/projects/${project.id}`)
      .type('application/json')
      .send('{"id":')
      .expect(400, { error: 'Request body must contain valid JSON.' });

    const invalid = structuredClone(project) as unknown as Record<string, unknown>;
    invalid.components = [{ id: 'R1', label: 'R1', kind: 'resistor' }];
    const response = await request(app).put(`/api/projects/${project.id}`).send(invalid).expect(400);
    expect(response.body.error).toMatch(/rotation/);
    expect(repo.get(project.id)).toBeUndefined();
  });

  it('returns 409 and the current revision for a stale HTTP save', async () => {
    const repo = repository();
    const app = createApp(repo);
    const project = createLedExampleProject();
    const first = await request(app).put(`/api/projects/${project.id}`).send(project).expect(200);
    await request(app).put(`/api/projects/${project.id}`).send(first.body).expect(200);
    const conflict = await request(app).put(`/api/projects/${project.id}`).send(first.body).expect(409);
    expect(conflict.body.currentRevision).toBe(2);
  });

  it('rejects a mismatched URL ID', async () => {
    const repo = repository();
    const app = createApp(repo);
    await request(app).put('/api/projects/not-the-id').send(createLedExampleProject()).expect(400);
  });
});
