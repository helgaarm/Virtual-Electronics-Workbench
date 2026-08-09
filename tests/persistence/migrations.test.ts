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
    expect(migrated.version).toBe(7);
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

  it('migrates version 4 projects to default Phase E instruments', () => {
    const legacy = projectRecord();
    legacy.version = 4;
    legacy.simulation = { timeStepSeconds: 0.001, speed: 2 };
    delete legacy.oscilloscope;
    delete legacy.signalGenerator;
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.simulation).toEqual({ timeStepSeconds: 0.001, speed: 2 });
    expect(migrated.oscilloscope.channels.ch1.label).toBe('CH1');
    expect(migrated.oscilloscope.channels.ch2.label).toBe('CH2');
    expect(migrated.signalGenerator).toMatchObject({
      enabled: false,
      waveform: 'square',
      frequencyHz: 1,
    });
  });

  it('migrates version 5 trigger defaults and normalizes legacy continuous scales', () => {
    const legacy = projectRecord();
    legacy.version = 5;
    const simulation = legacy.simulation as Record<string, unknown>;
    simulation.timeStepSeconds = 0.000001;
    simulation.speed = 0.1;
    const oscilloscope = legacy.oscilloscope as Record<string, unknown>;
    delete oscilloscope.triggerEdge;
    oscilloscope.timePerDivisionSeconds = 0.000001;
    const channels = oscilloscope.channels as Record<string, Record<string, unknown>>;
    channels.ch1.voltsPerDivisionV = 0.001;

    const migrated = migrateProjectDocument(legacy);
    expect(migrated.version).toBe(7);
    expect(migrated.simulation).toEqual({ timeStepSeconds: 0.00005, speed: 0.25 });
    expect(migrated.oscilloscope.timePerDivisionSeconds).toBe(0.00005);
    expect(migrated.oscilloscope.channels.ch1.voltsPerDivisionV).toBe(0.01);
    expect(migrated.oscilloscope.triggerEdge).toBe('rising');
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

  it('round-trips NE555 identity, package, orientation, and all eight pins', () => {
    const project = createStarterProject('ne555-astable');
    const migrated = migrateProjectDocument(structuredClone(project));
    const timer = migrated.components.find((component) => component.kind === 'ne555');
    expect(migrated).toEqual(project);
    expect(timer).toMatchObject({
      kind: 'ne555',
      deviceId: 'ne555n',
      packageId: 'DIP-8',
      simulationModel: 'hybrid-analogue-subcircuit',
      rotation: 0,
      terminalHoleIds: expect.objectContaining({ pin1: 'main:E10', pin8: 'main:F10' }),
    });
  });

  it.each([
    ['missing view', (value: Record<string, unknown>) => { delete value.view; }, /view/],
    ['missing analysis settings', (value: Record<string, unknown>) => { delete value.analysis; }, /analysis/],
    ['missing simulation settings', (value: Record<string, unknown>) => { delete value.simulation; }, /simulation/],
    ['missing oscilloscope settings', (value: Record<string, unknown>) => { delete value.oscilloscope; }, /oscilloscope/],
    ['missing signal generator settings', (value: Record<string, unknown>) => { delete value.signalGenerator; }, /signalGenerator/],
    ['invalid active instrument', (value: Record<string, unknown>) => {
      (value.analysis as Record<string, unknown>).activeInstrument = 'spectrum-analyzer';
    }, /activeInstrument/],
    ['invalid oscilloscope channel ID', (value: Record<string, unknown>) => {
      const oscilloscope = value.oscilloscope as Record<string, unknown>;
      const channels = oscilloscope.channels as Record<string, Record<string, unknown>>;
      channels.ch1.id = 'ch2';
    }, /oscilloscope.channels.ch1.id/],
    ['invalid oscilloscope scale', (value: Record<string, unknown>) => {
      (value.oscilloscope as Record<string, unknown>).timePerDivisionSeconds = 0;
    }, /timePerDivisionSeconds/],
    ['unsupported oscilloscope volts-per-division option', (value: Record<string, unknown>) => {
      const oscilloscope = value.oscilloscope as Record<string, unknown>;
      const channels = oscilloscope.channels as Record<string, Record<string, unknown>>;
      channels.ch1.voltsPerDivisionV = 0.03;
    }, /voltsPerDivisionV/],
    ['invalid oscilloscope trigger edge', (value: Record<string, unknown>) => {
      (value.oscilloscope as Record<string, unknown>).triggerEdge = 'both';
    }, /triggerEdge/],
    ['invalid signal-generator waveform', (value: Record<string, unknown>) => {
      (value.signalGenerator as Record<string, unknown>).waveform = 'triangle';
    }, /signalGenerator.waveform/],
    ['signal-generator frequency above supported range', (value: Record<string, unknown>) => {
      (value.signalGenerator as Record<string, unknown>).frequencyHz = 1_001;
    }, /signalGenerator.frequencyHz/],
    ['unknown signal-generator hole', (value: Record<string, unknown>) => {
      (value.signalGenerator as Record<string, unknown>).outputHoleId = 'main:not-a-hole';
    }, /signalGenerator/],
    ['invalid transient step', (value: Record<string, unknown>) => {
      (value.simulation as Record<string, unknown>).timeStepSeconds = 0;
    }, /timeStepSeconds/],
    ['unsupported finest-step speed', (value: Record<string, unknown>) => {
      const simulation = value.simulation as Record<string, unknown>;
      simulation.timeStepSeconds = 0.00005;
      simulation.speed = 4;
    }, /simulation.speed/],
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
    ['reserved instrument component ID', (value: Record<string, unknown>) => {
      (value.components as Array<Record<string, unknown>>)[0].id = 'signal-generator-output';
    }, /reserved/],
  ])('rejects %s', (_name, mutate, expected) => {
    const value = projectRecord();
    mutate(value);
    expect(() => migrateProjectDocument(value)).toThrow(expected);
    expect(() => migrateProjectDocument(value)).toThrow(ProjectValidationError);
  });
});
