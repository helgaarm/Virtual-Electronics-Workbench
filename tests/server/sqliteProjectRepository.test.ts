import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createLedExampleProject } from '../../src/domain/project';
import { createApp } from '../../server/app';
import { SqliteProjectRepository } from '../../server/sqliteProjectRepository';

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
    repo.save(project);
    expect(repo.get(project.id)).toEqual(project);
    expect(repo.list()).toEqual([
      { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt },
    ]);
    repo.save({ ...project, name: 'Renamed' });
    expect(repo.get(project.id)?.name).toBe('Renamed');
    expect(repo.remove(project.id)).toBe(true);
    expect(repo.get(project.id)).toBeUndefined();
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

  it('rejects a mismatched URL ID', async () => {
    const repo = repository();
    const app = createApp(repo);
    await request(app).put('/api/projects/not-the-id').send(createLedExampleProject()).expect(400);
  });
});
