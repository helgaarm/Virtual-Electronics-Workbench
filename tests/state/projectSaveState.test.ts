import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/domain/project';
import {
  isProjectDirty,
  projectBaseline,
  reconcileSavedProject,
} from '../../src/state/projectSaveState';

describe('project save state', () => {
  it('marks only the exact persisted revision and edit timestamp as clean', () => {
    const project = createEmptyProject();
    const baseline = projectBaseline(project);
    expect(isProjectDirty(project, baseline)).toBe(false);
    expect(isProjectDirty({ ...project, name: 'Edited', updatedAt: new Date(Date.now() + 1).toISOString() }, baseline)).toBe(true);
    expect(isProjectDirty({ ...project, revision: 1 }, baseline)).toBe(true);
  });

  it('does not overwrite edits made while a save is in flight', () => {
    const submitted = createEmptyProject();
    const edited = {
      ...submitted,
      name: 'Typed while saving',
      updatedAt: new Date(Date.parse(submitted.updatedAt) + 1_000).toISOString(),
    };
    const saved = { ...submitted, revision: 1 };
    const reconciled = reconcileSavedProject(edited, submitted, saved);
    expect(reconciled.name).toBe('Typed while saving');
    expect(reconciled.revision).toBe(1);
    expect(isProjectDirty(reconciled, projectBaseline(saved))).toBe(true);
  });

  it('adopts the server document when no newer edits exist', () => {
    const submitted = createEmptyProject();
    const saved = { ...submitted, revision: 1 };
    expect(reconcileSavedProject(submitted, submitted, saved)).toEqual(saved);
  });
});
