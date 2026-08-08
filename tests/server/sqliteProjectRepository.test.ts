import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createLedExampleProject } from '../../src/domain/project';
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

  it('exposes health and project CRUD over HTTP', async () => {
    const repo = repository();
    const app = createApp(repo);
    const project = createLedExampleProject();
    await request(app).get('/api/health').expect(200, { status: 'ok', storage: 'sqlite' });
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
