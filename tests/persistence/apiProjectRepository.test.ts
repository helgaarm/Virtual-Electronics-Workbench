import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import {
  ApiProjectRepository,
  ProjectConflictClientError,
  ProjectSchemaMismatchClientError,
} from '../../src/persistence/apiProjectRepository';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('API project repository', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates list responses instead of trusting arbitrary JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ id: 'only-an-id' }])));
    await expect(new ApiProjectRepository('/projects').list())
      .rejects.toThrow(/Invalid project summary/);
  });

  it('rejects repeated pagination cursors instead of looping forever or returning a partial list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'x-next-project-cursor': 'repeated' } })));
    await expect(new ApiProjectRepository('/api/projects', 'sites').list()).rejects.toThrow(/could not be completed/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('migrates project responses and returns undefined for 404', async () => {
    const project = createLedExampleProject();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(project))
      .mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiProjectRepository('/projects');
    await expect(repository.get(project.id)).resolves.toEqual(project);
    await expect(repository.get('missing')).resolves.toBeUndefined();
  });

  it('sends complete documents and exposes optimistic-concurrency conflicts', async () => {
    const project = createLedExampleProject();
    const saved = { ...project, revision: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(saved))
      .mockResolvedValueOnce(jsonResponse({ error: 'stale', currentRevision: 2 }, 409));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiProjectRepository('/projects');
    await expect(repository.save(project)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/projects/${encodeURIComponent(project.id)}`, expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(project),
    }));
    await expect(repository.save(saved)).rejects.toBeInstanceOf(ProjectConflictClientError);
  });

  it('explains how to recover when the SQLite service is an older application version', async () => {
    const project = createLedExampleProject();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      error: 'Project version 8 is not supported by version 7.',
    }, 409)));
    await expect(new ApiProjectRepository('/projects').save(project))
      .rejects.toBeInstanceOf(ProjectSchemaMismatchClientError);
    await expect(new ApiProjectRepository('/projects').save(project))
      .rejects.toThrow(/restart npm run dev/);
  });

  it('gives Sites-specific recovery for expired sign-in and version mismatch', async () => {
    const repository = new ApiProjectRepository('/projects', 'sites');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Sign in</html>', { status: 401 })));
    await expect(repository.list()).rejects.toThrow(/Sign in to this Site/);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Project version 20 is not supported by version 19.' }, 409)));
    await expect(repository.save(createLedExampleProject())).rejects.toThrow(/Sites backend/);
  });

  it('binds every Sites operation to the account that opened the workbench', async () => {
    const project = createLedExampleProject();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([])).mockResolvedValueOnce(jsonResponse(project))
      .mockResolvedValueOnce(jsonResponse({ ...project, revision: 1 })).mockResolvedValueOnce(jsonResponse({ deleted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiProjectRepository('/projects', 'sites', 'owner@example.test');
    await repository.list(); await repository.get(project.id); await repository.save(project); await repository.remove(project.id);
    for (const call of fetchMock.mock.calls) expect(call[1]).toMatchObject({ headers: { 'x-workbench-account': 'owner@example.test' } });
  });
});
