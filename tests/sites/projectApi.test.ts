import { afterEach, describe, expect, it } from 'vitest';
import { createLedExampleProject, PROJECT_SCHEMA_VERSION } from '../../src/domain/project';
import { projectApi } from '../../sites/projectApi';
import { SqliteD1 } from './sqliteD1';

const databases: SqliteD1[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup() {
  const database = new SqliteD1();
  databases.push(database);
  return {
    database,
    call: (path: string, method = 'GET', body?: unknown, headers?: HeadersInit) => projectApi(
      new Request(`https://workbench.test${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), database,
    ),
  };
}

describe('Sites project API', () => {
  it('serves durable CRUD with the local API contract', async () => {
    const { call } = setup();
    expect(await (await call('/api/health')).json()).toEqual({ status: 'ok', storage: 'd1', projectSchemaVersion: PROJECT_SCHEMA_VERSION });
    const project = createLedExampleProject();
    const path = `/api/projects/${project.id}`;
    const response = await call(path, 'PUT', project);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const saved = await response.json();
    expect(saved).toEqual({ ...project, revision: 1 });
    expect(await (await call(path)).json()).toEqual(saved);
    expect(await (await call('/api/projects')).json()).toHaveLength(1);
    expect(await (await call(path, 'PUT', saved)).json()).toMatchObject({ revision: 2 });
    const stale = await call(path, 'PUT', saved);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ currentRevision: 2 });
    expect(await (await call(path, 'DELETE')).json()).toEqual({ deleted: true });
    expect((await call(path)).status).toBe(404);
    expect((await call(path, 'DELETE')).status).toBe(404);
  });

  it('rejects mismatched IDs, malformed data and future versions', async () => {
    const { call, database } = setup();
    const project = createLedExampleProject();
    const path = `/api/projects/${project.id}`;
    expect((await call('/api/projects/other', 'PUT', project)).status).toBe(400);
    expect((await call(path, 'PUT', { ...project, name: '' })).status).toBe(400);
    expect((await call(path, 'PUT', { ...project, version: PROJECT_SCHEMA_VERSION + 1 })).status).toBe(409);
    expect((await projectApi(new Request(`https://workbench.test${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{bad' }), database)).status).toBe(400);
    expect((await call('/api/projects/%FF')).status).toBe(400);
    expect(await (await call('/api/projects')).json()).toEqual([]);
  });

  it('rejects cross-site writes, unsupported content and oversized streamed bodies', async () => {
    const { call, database } = setup();
    const project = createLedExampleProject();
    const path = `/api/projects/${project.id}`;
    expect((await call(path, 'PUT', project, { origin: 'https://other.test' })).status).toBe(403);
    expect((await call(path, 'DELETE', undefined, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call(path, 'PUT', project, { 'content-type': 'text/plain' })).status).toBe(415);
    const oversized = new Request(`https://workbench.test${path}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: ' '.repeat(2 * 1024 * 1024 + 1),
    });
    expect((await projectApi(oversized, database)).status).toBe(413);
    expect(await (await call('/api/projects')).json()).toEqual([]);
  });

  it('fails closed when DB or schema is unavailable, without leaking provider errors', async () => {
    expect((await projectApi(new Request('https://workbench.test/api/projects'), undefined)).status).toBe(503);
    const { database, call } = setup();
    database.database.exec('DROP TABLE projects');
    const response = await call('/api/projects');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Project storage is temporarily unavailable. Please retry.' });
    expect((await call('/api/unknown')).status).toBe(404);
    expect((await call('/api/projects', 'POST')).status).toBe(405);
  });
});
