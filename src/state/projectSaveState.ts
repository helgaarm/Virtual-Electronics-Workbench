import type { WorkbenchProject } from '../domain/project';

export interface SavedBaseline {
  id: string;
  revision: number;
  updatedAt: string;
}

export function projectBaseline(project: WorkbenchProject): SavedBaseline {
  return { id: project.id, revision: project.revision, updatedAt: project.updatedAt };
}

export function isProjectDirty(project: WorkbenchProject, baseline: SavedBaseline | undefined): boolean {
  return !baseline ||
    baseline.id !== project.id ||
    baseline.revision !== project.revision ||
    baseline.updatedAt !== project.updatedAt;
}

export function reconcileSavedProject(
  current: WorkbenchProject,
  submitted: WorkbenchProject,
  saved: WorkbenchProject,
): WorkbenchProject {
  if (current.id !== submitted.id || current.revision !== submitted.revision) return current;
  if (current.updatedAt === submitted.updatedAt) return saved;
  return { ...current, revision: saved.revision };
}
