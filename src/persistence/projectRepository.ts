import type { WorkbenchProject } from '../domain/project';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<WorkbenchProject | undefined>;
  save(project: WorkbenchProject): Promise<WorkbenchProject>;
  remove(id: string): Promise<boolean>;
}
