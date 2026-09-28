import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { BrowserProjectRepository } from '../../src/persistence/browserProjectRepository';
import { importBrowserProjects } from '../../src/persistence/importBrowserProjects';

function repositories() {
  const factory = new IDBFactory();
  return { source: new BrowserProjectRepository('source', factory), target: new BrowserProjectRepository('target', factory) };
}

describe('Copying legacy browser projects to Sites', () => {
  it('retains IDs, complete documents and browser originals; retries do not duplicate', async () => {
    const { source, target } = repositories();
    const original = await source.save(createLedExampleProject());
    expect(await importBrowserProjects(source, target)).toEqual({ copied: 1, alreadyCopied: 0, failures: [] });
    expect(await target.get(original.id)).toEqual(original);
    expect(await source.get(original.id)).toEqual(original);
    expect(await importBrowserProjects(source, target)).toEqual({ copied: 0, alreadyCopied: 1, failures: [] });
  });

  it('preserves both versions on ID collisions and reuses the copy ID on retry', async () => {
    const { source, target } = repositories();
    const original = await source.save(createLedExampleProject());
    const cloud = await target.save({ ...original, revision: 0, name: 'Newer cloud work' });
    expect((await importBrowserProjects(source, target)).copied).toBe(1);
    expect(await target.get(original.id)).toEqual(cloud);
    expect(await target.list()).toHaveLength(2);
    expect((await importBrowserProjects(source, target)).alreadyCopied).toBe(1);
    expect(await target.list()).toHaveLength(2);
    expect(await source.get(original.id)).toEqual(original);
  });

  it('reports failures without removing originals, and safely resumes', async () => {
    const { source, target } = repositories();
    const original = await source.save(createLedExampleProject());
    const failure = vi.spyOn(target, 'save').mockRejectedValueOnce(new Error('Offline'));
    expect((await importBrowserProjects(source, target)).failures).toEqual([{ id: original.id, message: 'Offline' }]);
    failure.mockRestore();
    expect((await importBrowserProjects(source, target)).copied).toBe(1);
    expect(await source.get(original.id)).toEqual(original);
  });

  it('handles two tabs importing the same project concurrently', async () => {
    const { source, target } = repositories();
    await source.save(createLedExampleProject());
    const results = await Promise.all([importBrowserProjects(source, target), importBrowserProjects(source, target)]);
    expect(results.flatMap((result) => result.failures)).toEqual([]);
    expect(await target.list()).toHaveLength(1);
  });
});
