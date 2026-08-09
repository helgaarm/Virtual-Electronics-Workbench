import type { WorkbenchProject } from '../domain/project';
import { migrateProjectDocument } from './migrations';
import type { ProjectRepository, ProjectSummary } from './projectRepository';

export class ProjectConflictClientError extends Error {
  constructor(public readonly currentRevision?: number) {
    super('This project was changed in another window. Reload it or use Save as.');
  }
}

export class ProjectSchemaMismatchClientError extends Error {
  constructor(serverMessage: string) {
    super(
      `The browser and SQLite service are running different application versions. `
      + `Stop the existing service, restart npm run dev, and reload this page. (${serverMessage})`,
    );
  }
}

async function responseJson(response: Response): Promise<unknown> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body ? String(body.error) : response.statusText;
    if (/Project version \d+ is not supported by version \d+\./.test(message)) {
      throw new ProjectSchemaMismatchClientError(message);
    }
    if (response.status === 409) {
      const currentRevision =
        typeof body === 'object' && body && 'currentRevision' in body &&
        typeof body.currentRevision === 'number'
          ? body.currentRevision
          : undefined;
      if (currentRevision !== undefined) throw new ProjectConflictClientError(currentRevision);
    }
    throw new Error(message);
  }
  return body;
}

export class ApiProjectRepository implements ProjectRepository {
  constructor(private readonly baseUrl = '/api/projects') {}

  async list(): Promise<ProjectSummary[]> {
    const body = await responseJson(await fetch(this.baseUrl));
    if (!Array.isArray(body)) throw new Error('Invalid project list response.');
    return body.map((value, index) => {
      if (
        typeof value !== 'object' || value === null ||
        !('id' in value) || typeof value.id !== 'string' ||
        !('name' in value) || typeof value.name !== 'string' ||
        !('createdAt' in value) || typeof value.createdAt !== 'string' ||
        !('updatedAt' in value) || typeof value.updatedAt !== 'string'
      ) {
        throw new Error(`Invalid project summary at index ${index}.`);
      }
      return {
        id: value.id,
        name: value.name,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      };
    });
  }

  async get(id: string): Promise<WorkbenchProject | undefined> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    return migrateProjectDocument(await responseJson(response));
  }

  async save(project: WorkbenchProject): Promise<WorkbenchProject> {
    const body = await responseJson(
      await fetch(`${this.baseUrl}/${encodeURIComponent(project.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(project),
      }),
    );
    return migrateProjectDocument(body);
  }

  async remove(id: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.status === 404) return false;
    await responseJson(response);
    return true;
  }
}
