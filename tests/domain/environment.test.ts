import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/domain/project';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { migrateProjectDocument, ProjectValidationError } from '../../src/persistence/migrations';
import { createPlacedComponent } from '../../src/state/workbenchActions';
import { extractCircuit } from '../../src/simulation/circuitBuilder';

describe('external environment', () => {
  it('migrates older projects to calm default conditions', () => {
    const legacy = structuredClone(createEmptyProject()) as unknown as Record<string, unknown>;
    legacy.version = 11;
    delete legacy.environment;
    expect(migrateProjectDocument(legacy).environment).toEqual({
      temperatureC: 25, relativeHumidityPercent: 50, windSpeedMps: 0,
      illuminanceLux: 500, lightType: 'daylight', wavelengthNm: 550,
    });
  });

  it('rejects environment values outside supported bounds', () => {
    const project = createEmptyProject();
    project.environment.relativeHumidityPercent = 101;
    expect(() => migrateProjectDocument(project)).toThrow(ProjectValidationError);
  });

  it('drives TMP36 extraction from shared ambient temperature', () => {
    const project = createEmptyProject();
    const sensor = createPlacedComponent('tmp36', createBreadboardDefinition(project.board.id, project.board.columns), []);
    if (!sensor || sensor.kind !== 'tmp36') throw new Error('TMP36 placement failed.');
    project.components = [sensor];
    project.powerOn = true;
    project.environment.temperatureC = 40;
    const source = extractCircuit(project).circuit.components.find((component) => component.id === sensor.id);
    expect(source).toMatchObject({ kind: 'voltage-source', voltageV: 0.9 });
  });
});
