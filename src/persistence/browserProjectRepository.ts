import type { WorkbenchProject } from '../domain/project';
import { ProjectConflictClientError } from './apiProjectRepository';
import { migrateProjectDocument } from './migrations';
import type { ProjectRepository, ProjectSummary } from './projectRepository';

const STORE = 'projects';
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Sites storage is scoped to this browser profile and origin, with atomic revisions. */
export class BrowserProjectRepository implements ProjectRepository {
  constructor(
    private readonly databaseName = 'virtual-electronics-workbench',
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('Browser storage is unavailable. Enable site storage to save projects.'));
        return;
      }
      let blocked = false;
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other workbench tabs and retry opening browser storage.'));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) { database.close(); return; }
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, result: (value: T) => void, fail: (error: unknown) => void) => void,
  ): Promise<T> {
    const database = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        let result: T;
        let failure: unknown;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Browser storage transaction failed.'));
        const fail = (error: unknown) => {
          failure = error;
          transaction.abort();
        };
        try {
          operation(transaction.objectStore(STORE), (value) => { result = value; }, fail);
        } catch (error) {
          fail(error);
        }
      });
    } finally {
      database.close();
    }
  }

  list(): Promise<ProjectSummary[]> {
    return this.transaction('readonly', (store, result, fail) => {
      const summaries: ProjectSummary[] = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) {
            result(summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)));
            return;
          }
          const project = migrateProjectDocument(cursor.value as unknown);
          summaries.push({ id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt });
          cursor.continue();
        } catch (error) { fail(error); }
      };
    });
  }

  get(id: string): Promise<WorkbenchProject | undefined> {
    return this.transaction('readonly', (store, result, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          result(request.result === undefined ? undefined : migrateProjectDocument(request.result as unknown));
        } catch (error) { fail(error); }
      };
    });
  }

  async save(value: WorkbenchProject): Promise<WorkbenchProject> {
    const project = migrateProjectDocument(value);
    if (new TextEncoder().encode(JSON.stringify(project)).byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error('Project document exceeds the 2 MB limit.');
    }
    return this.transaction('readwrite', (store, result, fail) => {
      const request = store.get(project.id);
      request.onsuccess = () => {
        try {
          const existing = request.result === undefined ? undefined : migrateProjectDocument(request.result as unknown);
          if (existing ? existing.revision !== project.revision : project.revision !== 0) {
            throw new ProjectConflictClientError(existing?.revision);
          }
          const saved = { ...project, revision: project.revision + 1, createdAt: existing?.createdAt ?? project.createdAt };
          store.put(saved);
          result(saved);
        } catch (error) { fail(error); }
      };
    });
  }

  remove(id: string): Promise<boolean> {
    return this.transaction('readwrite', (store, result) => {
      const request = store.count(id);
      request.onsuccess = () => {
        result(request.result > 0);
        store.delete(id);
      };
    });
  }
}
