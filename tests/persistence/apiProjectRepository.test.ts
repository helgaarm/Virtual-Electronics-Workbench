import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { ApiProjectRepository, ProjectConflictClientError } from '../../src/persistence/apiProjectRepository';

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
});
