import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLedExampleProject, PROJECT_SCHEMA_VERSION } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
import { BrowserProjectRepository } from '../../src/persistence/browserProjectRepository';
import { ProjectConflictClientError } from '../../src/persistence/apiProjectRepository';
import { createProjectStorage } from '../../src/persistence/projectStorage';

function setup() {
  const factory = new IDBFactory();
  return { factory, repo: new BrowserProjectRepository('test', factory) };
}

async function seed(factory: IDBFactory, value: unknown): Promise<void> {
  await new BrowserProjectRepository('test', factory).list();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('test', 1);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('projects', 'readwrite');
      transaction.objectStore('projects').put(value);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

describe('Sites browser project persistence', () => {
  it.each(['switched-led', 'nano-blink', 'wind-constant-temperature'] as const)('reopens the full %s project from a new repository', async (id) => {
    const { factory, repo } = setup();
    const project = createStarterProject(id);
    const saved = await repo.save(project);
    expect(saved.revision).toBe(1);
    expect(project.revision).toBe(0);
    const reopened = new BrowserProjectRepository('test', factory);
    expect(await reopened.get(project.id)).toEqual(saved);
    expect(await reopened.list()).toEqual([{ id: saved.id, name: saved.name, createdAt: saved.createdAt, updatedAt: saved.updatedAt }]);
  });

  it('allows only one of two simultaneous stale-tab saves to commit', async () => {
    const { factory, repo } = setup();
    const secondTab = new BrowserProjectRepository('test', factory);
    const original = await repo.save(createLedExampleProject());
    const results = await Promise.allSettled([
      repo.save({ ...original, name: 'First tab' }),
      secondTab.save({ ...original, name: 'Second tab' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    expect(failed?.reason).toBeInstanceOf(ProjectConflictClientError);
    expect(failed?.reason.currentRevision).toBe(2);
    expect((await repo.get(original.id))?.revision).toBe(2);
  });

  it('sorts summaries, preserves creation time, deletes, and rejects resurrection from stale state', async () => {
    const { repo } = setup();
    const project = await repo.save(createLedExampleProject());
    const copy = await repo.save({ ...project, id: 'new-copy', revision: 0, updatedAt: '2099-01-01T00:00:00.000Z' });
    expect((await repo.list()).map((value) => value.id)).toEqual([copy.id, project.id]);
    const updated = await repo.save({ ...project, createdAt: '2000-01-01T00:00:00.000Z' });
    expect(updated.createdAt).toBe(project.createdAt);
    expect(await repo.remove(project.id)).toBe(true);
    expect(await repo.remove(project.id)).toBe(false);
    expect(await repo.get(project.id)).toBeUndefined();
    await expect(repo.save(updated)).rejects.toBeInstanceOf(ProjectConflictClientError);
  });

  it('migrates older documents and leaves unsupported future documents intact', async () => {
    const { factory, repo } = setup();
    const legacy = { ...createLedExampleProject(), version: 12 };
    await seed(factory, legacy);
    expect((await repo.get(legacy.id))?.version).toBe(PROJECT_SCHEMA_VERSION);
    const future = { ...legacy, version: PROJECT_SCHEMA_VERSION + 1 };
    await seed(factory, future);
    await expect(repo.get(future.id)).rejects.toThrow(/not supported/);
    await expect(repo.save({ ...createLedExampleProject(), id: future.id })).rejects.toThrow(/not supported/);
    await expect(repo.get(future.id)).rejects.toThrow(/not supported/);
  });

  it('rejects malformed storage without silently overwriting it', async () => {
    const { factory, repo } = setup();
    const project = createLedExampleProject();
    await seed(factory, { id: project.id, version: PROJECT_SCHEMA_VERSION });
    await expect(repo.list()).rejects.toThrow();
    await expect(repo.save(project)).rejects.toThrow();
    await expect(repo.get(project.id)).rejects.toThrow();
  });

  it('rejects invalid incoming values before persisting anything', async () => {
    const { repo } = setup();
    await expect(repo.save({ ...createLedExampleProject(), name: '' })).rejects.toThrow();
    expect(await repo.list()).toEqual([]);
  });

  it('reports unavailable browser storage and keeps local mode on SQLite', async () => {
    await expect(new BrowserProjectRepository('test', undefined).list()).rejects.toThrow(/unavailable/);
    expect(createProjectStorage('sites').location).toBe('Sites');
    expect(createProjectStorage('production').location).toBe('SQLite');
    expect(createProjectStorage('development').location).toBe('SQLite');
  });
});
