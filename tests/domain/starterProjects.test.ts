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
import { createTransientState, runTransient } from '../../src/simulation';

describe('classic starter projects', () => {
  it.each(STARTER_PROJECTS)('builds a valid and solvable $name template', ({ id }) => {
    const project = createStarterProject(id);
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    expect(project.revision).toBe(0);
    expect(validateOccupancy(board, project.components)).toEqual([]);
    expect(migrateProjectDocument(structuredClone(project))).toEqual(project);
    const simulation = simulateProject(project);
    if (id === 'ne555-astable') {
      const transient = runTransient(simulation.extraction.circuit, {
        durationSeconds: 1.5,
        timeStepSeconds: 0.001,
      });
      expect(transient.result.errors).toEqual([]);
      expect(transient.samples).toHaveLength(1_500);
      const outputNodeId = simulation.extraction.componentTerminalNodes.U1.pin3;
      const timingNodeId = simulation.extraction.componentTerminalNodes.U1.pin2;
      expect(simulation.extraction.componentTerminalNodes.U1.pin6).toBe(timingNodeId);
      const outputVoltages = transient.samples.map((sample) => sample.nodeVoltages[outputNodeId]);
      const timingVoltages = transient.samples.map((sample) => sample.nodeVoltages[timingNodeId]);
      const risingEdgeTimes = outputVoltages.slice(1).flatMap(
        (voltage, index) => outputVoltages[index] < 2 && voltage >= 2
          ? [transient.samples[index + 1].timeSeconds]
          : [],
      );
      expect(risingEdgeTimes.length).toBeGreaterThanOrEqual(4);
      const measuredFrequencyHz = 1 / (risingEdgeTimes.at(-1)! - risingEdgeTimes.at(-2)!);
      expect(measuredFrequencyHz).toBeGreaterThan(4.5);
      expect(measuredFrequencyHz).toBeLessThan(5.5);
      const steadyOutput = outputVoltages.slice(100);
      const highDutyFraction = steadyOutput.filter((voltage) => voltage >= 2).length
        / steadyOutput.length;
      expect(highDutyFraction).toBeGreaterThan(0.55);
      expect(highDutyFraction).toBeLessThan(0.8);
      expect(Math.min(...outputVoltages)).toBeLessThan(0.5);
      expect(Math.max(...outputVoltages)).toBeGreaterThan(4);
      expect(Math.min(...timingVoltages)).toBeLessThan(2);
      expect(Math.max(...timingVoltages)).toBeGreaterThan(3);
      expect(simulation.extraction.holeToNodeId[project.oscilloscope.channels.ch1.positiveHoleId!])
        .toBe(outputNodeId);
      expect(simulation.extraction.holeToNodeId[project.oscilloscope.channels.ch2.positiveHoleId!])
        .toBe(timingNodeId);
      return;
    }
    expect(simulation.result.errors).toEqual([]);
    expect(simulation.result.status).not.toBe('error');
  });

  it('creates a fresh unsaved identity every time a template is loaded', () => {
    const first = createStarterProject('switched-led');
    const second = createStarterProject('switched-led');
    expect(first.id).not.toBe(second.id);
    expect(first.revision).toBe(0);
    expect(second.revision).toBe(0);
  });

  it('includes the complete thermometer component inventory and TMP36 probe', () => {
    const project = createStarterProject('digital-thermometer');
    const kinds = project.components.map((component) => component.kind);
    expect(kinds).toContain('tmp36');
    expect(kinds).toContain('attiny85');
    expect(kinds.filter((kind) => kind === '74hc595')).toHaveLength(2);
    expect(kinds).toContain('four-digit-seven-segment');
    expect(kinds.filter((kind) => kind === 'bc547' || kind === '2n3904')).toHaveLength(4);
    expect(project.probes[0].label).toBe('TMP36 output');
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

  it('provides a real RC starter circuit whose capacitor charges', () => {
    const project = createStarterProject('rc-charge-discharge');
    const simulation = simulateProject(project);
    const run = runTransient(simulation.extraction.circuit, {
      durationSeconds: 1,
      timeStepSeconds: 0.005,
      initialState: createTransientState(simulation.extraction.circuit),
    });
    expect(run.state.capacitorVoltages.C1).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);

    const discharge = runTransient(simulation.extraction.circuit, {
      durationSeconds: 2,
      timeStepSeconds: 0.005,
      initialState: createTransientState(simulation.extraction.circuit, run.state),
    });
    expect(discharge.state.capacitorVoltages.C1)
      .toBeCloseTo(5 * (1 - Math.exp(-2)) * Math.exp(-1), 2);
  });
});
