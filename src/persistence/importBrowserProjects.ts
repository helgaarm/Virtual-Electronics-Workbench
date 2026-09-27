import type { WorkbenchProject } from '../domain/project';
import { ProjectConflictClientError } from './apiProjectRepository';
import type { ProjectRepository } from './projectRepository';

export interface BrowserImportResult {
  copied: number;
  alreadyCopied: number;
  failures: { id: string; message: string }[];
}

function contents(project: WorkbenchProject): string {
  return JSON.stringify({ ...project, id: '', revision: 0 });
}

/** Copies only: source records remain available for recovery and offline use. */
export async function importBrowserProjects(source: ProjectRepository, target: ProjectRepository): Promise<BrowserImportResult> {
  const result: BrowserImportResult = { copied: 0, alreadyCopied: 0, failures: [] };
  for (const summary of await source.list()) {
    try {
      const original = await source.get(summary.id);
      if (!original) continue;
      let candidate = { ...original, revision: 0 };
      const existing = await target.get(original.id);
      if (existing && contents(existing) !== contents(original)) {
        // A deterministic copy ID makes retries safe, even across tabs or interrupted imports.
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(original)));
        const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        candidate = { ...candidate, id: `browser-import-${hash}` };
      }
      const stored = candidate.id === original.id ? existing : await target.get(candidate.id);
      if (stored) {
        if (contents(stored) !== contents(original)) throw new Error('A different imported copy exists. Original browser project retained.');
        result.alreadyCopied += 1;
        continue;
      }
      try {
        await target.save(candidate);
        result.copied += 1;
      } catch (error) {
        // Another tab may have completed the same copy between GET and PUT.
        if (!(error instanceof ProjectConflictClientError)) throw error;
        const concurrent = await target.get(candidate.id);
        if (!concurrent || contents(concurrent) !== contents(original)) throw error;
        result.alreadyCopied += 1;
      }
    } catch (error) {
      result.failures.push({ id: summary.id, message: error instanceof Error ? error.message : 'Copy failed.' });
    }
  }
  return result;
}
