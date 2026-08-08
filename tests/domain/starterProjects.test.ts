import { describe, expect, it } from 'vitest';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { validateOccupancy } from '../../src/domain/physical/occupancy';
import {
  createStarterProject,
  STARTER_PROJECTS,
  type StarterProjectId,
} from '../../src/domain/starterProjects';
import { measureProbeVoltage } from '../../src/measurement/dcMeasurements';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { simulateProject } from '../../src/simulation';

describe('classic starter projects', () => {
  it.each(STARTER_PROJECTS)('builds a valid and solvable $name template', ({ id }) => {
    const project = createStarterProject(id);
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    expect(project.revision).toBe(0);
    expect(validateOccupancy(board, project.components)).toEqual([]);
    expect(migrateProjectDocument(structuredClone(project))).toEqual(project);
    const simulation = simulateProject(project);
    expect(simulation.result.status).not.toBe('error');
    expect(simulation.result.errors).toEqual([]);
  });

  it('creates a fresh unsaved identity every time a template is loaded', () => {
    const first = createStarterProject('switched-led');
    const second = createStarterProject('switched-led');
    expect(first.id).not.toBe(second.id);
    expect(first.revision).toBe(0);
    expect(second.revision).toBe(0);
  });

  it('produces the expected 2.5 V divider midpoint', () => {
    const project = createStarterProject('voltage-divider');
    const simulation = simulateProject(project);
    const reading = measureProbeVoltage(project.probes[0], simulation.extraction, simulation.result);
    expect(reading.status).toBe('valid');
    expect(reading.value).toBeCloseTo(2.5, 6);
  });

  it.each([
    ['series-leds', ['D1', 'D2']],
    ['parallel-indicators', ['D1', 'D2']],
  ] as const)('lights both LEDs in %s', (id, ledIds) => {
    const simulation = simulateProject(createStarterProject(id as StarterProjectId));
    for (const ledId of ledIds) expect(simulation.result.componentCurrents[ledId]).toBeGreaterThan(0.001);
  });
});
