import { describe, expect, it } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { createStarterProject } from '../../src/domain/starterProjects';
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

  it('migrates version 1 documents to the Phase C instrument schema', () => {
    const legacy = projectRecord();
    legacy.version = 1;
    delete legacy.revision;
    delete legacy.analysis;
    delete legacy.simulation;
    for (const probe of legacy.probes as Array<Record<string, unknown>>) delete probe.instrumentId;
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.version).toBe(4);
    expect(migrated.revision).toBe(0);
    expect(migrated.probes[0].instrumentId).toBe('multimeter');
    expect(migrated.analysis).toMatchObject({
      activeInstrument: 'multimeter',
      activeProbeTerminal: 'positive',
      selectedProbeId: migrated.probes[0].id,
    });
  });

  it('migrates version 2 probes and allows intentionally disconnected leads', () => {
    const legacy = projectRecord();
    legacy.version = 2;
    delete legacy.analysis;
    delete legacy.simulation;
    const probe = (legacy.probes as Array<Record<string, unknown>>)[0];
    delete probe.instrumentId;
    delete probe.referenceHoleId;
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.probes[0]).not.toHaveProperty('referenceHoleId');
    expect(migrated.analysis.selectedProbeId).toBe(migrated.probes[0].id);
  });

  it('migrates version 3 projects to default transient settings', () => {
    const legacy = projectRecord();
    legacy.version = 3;
    delete legacy.simulation;
    expect(migrateProjectDocument(legacy).simulation).toEqual({
      timeStepSeconds: 0.005,
      speed: 1,
    });
  });

  it('round-trips capacitor data and rejects invalid persisted capacitance', () => {
    const project = createStarterProject('rc-charge-discharge');
    expect(migrateProjectDocument(structuredClone(project))).toEqual(project);

    const invalid = structuredClone(project) as unknown as Record<string, unknown>;
    const capacitor = (invalid.components as Array<Record<string, unknown>>)
      .find((component) => component.kind === 'capacitor');
    if (!capacitor) throw new Error('RC starter capacitor is missing.');
    capacitor.capacitanceFarads = 0;
    expect(() => migrateProjectDocument(invalid)).toThrow(/capacitanceFarads/);
  });

  it.each([
    ['missing view', (value: Record<string, unknown>) => { delete value.view; }, /view/],
    ['missing analysis settings', (value: Record<string, unknown>) => { delete value.analysis; }, /analysis/],
    ['missing simulation settings', (value: Record<string, unknown>) => { delete value.simulation; }, /simulation/],
    ['invalid transient step', (value: Record<string, unknown>) => {
      (value.simulation as Record<string, unknown>).timeStepSeconds = 0;
    }, /timeStepSeconds/],
    ['unknown selected probe', (value: Record<string, unknown>) => {
      (value.analysis as Record<string, unknown>).selectedProbeId = 'probe-missing';
    }, /existing probe/],
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
