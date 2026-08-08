import { describe, expect, it } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { migrateProjectDocument, UnsupportedProjectVersionError } from '../../src/persistence/migrations';

describe('project document migrations', () => {
  it('accepts the current version without losing physical data', () => {
    const project = createLedExampleProject();
    expect(migrateProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('rejects future versions explicitly', () => {
    const project = { ...createLedExampleProject(), version: 99 };
    expect(() => migrateProjectDocument(project)).toThrow(UnsupportedProjectVersionError);
  });
});
