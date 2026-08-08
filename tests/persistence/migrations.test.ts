import { describe, expect, it } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import {
  migrateProjectDocument,
  ProjectValidationError,
  UnsupportedProjectVersionError,
} from '../../src/persistence/migrations';

function projectRecord(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createLedExampleProject())) as Record<string, unknown>;
}

describe('project document migrations', () => {
  it('accepts the current version without losing physical data', () => {
    const project = createLedExampleProject();
    expect(migrateProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('rejects future versions explicitly', () => {
    const project = { ...createLedExampleProject(), version: 99 };
    expect(() => migrateProjectDocument(project)).toThrow(UnsupportedProjectVersionError);
  });

  it('migrates version 1 documents to revision-aware version 2', () => {
    const legacy = projectRecord();
    legacy.version = 1;
    delete legacy.revision;
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.revision).toBe(0);
  });

  it.each([
    ['missing view', (value: Record<string, unknown>) => { delete value.view; }, /view/],
    ['invalid rotation', (value: Record<string, unknown>) => {
      (value.components as Array<Record<string, unknown>>)[0].rotation = 45;
    }, /rotation/],
    ['invalid anchored state', (value: Record<string, unknown>) => {
      (value.components as Array<Record<string, unknown>>)[0].anchored = 'sometimes';
    }, /anchored/],
    ['invalid electrical value', (value: Record<string, unknown>) => {
      (value.components as Array<Record<string, unknown>>)[3].resistanceOhms = 0;
    }, /resistanceOhms/],
    ['unknown hole', (value: Record<string, unknown>) => {
      const component = (value.components as Array<Record<string, unknown>>)[0];
      (component.terminalHoleIds as Record<string, unknown>).positive = 'main:not-a-hole';
    }, /unknown hole/],
    ['unrealistically stretched component legs', (value: Record<string, unknown>) => {
      const component = (value.components as Array<Record<string, unknown>>)[4];
      (component.terminalHoleIds as Record<string, unknown>).cathode = 'main:A30';
    }, /allows at most/],
    ['duplicate component ID', (value: Record<string, unknown>) => {
      const components = value.components as Array<Record<string, unknown>>;
      components[1].id = components[0].id;
    }, /unique IDs/],
    ['unsafe component ID', (value: Record<string, unknown>) => {
      (value.components as Array<Record<string, unknown>>)[0].id = '__proto__';
    }, /safe identifier/],
  ])('rejects %s', (_name, mutate, expected) => {
    const value = projectRecord();
    mutate(value);
    expect(() => migrateProjectDocument(value)).toThrow(expected);
    expect(() => migrateProjectDocument(value)).toThrow(ProjectValidationError);
  });
});
