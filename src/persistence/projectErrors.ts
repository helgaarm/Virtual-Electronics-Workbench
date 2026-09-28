import type { WorkbenchProject } from '../domain/project';

export class ProjectConflictError extends Error {
  constructor(public readonly current?: WorkbenchProject) {
    super('The project has changed since it was opened. Reload it or save a copy.');
  }
}
