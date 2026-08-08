import type { WorkbenchProject } from '../domain/project';
import { migrateProjectDocument } from './migrations';
import type { ProjectRepository, ProjectSummary } from './projectRepository';

async function responseJson(response: Response): Promise<unknown> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body ? String(body.error) : response.statusText;
    throw new Error(message);
  }
  return body;
}

export class ApiProjectRepository implements ProjectRepository {
  constructor(private readonly baseUrl = '/api/projects') {}

  async list(): Promise<ProjectSummary[]> {
    const body = await responseJson(await fetch(this.baseUrl));
    if (!Array.isArray(body)) throw new Error('Invalid project list response.');
    return body as ProjectSummary[];
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
