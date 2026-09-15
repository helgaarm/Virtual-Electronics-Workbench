import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../../src/domain/starterProjects';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientState, runTransient, stepTransient } from '../../src/simulation';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { terminalEntries } from '../../src/domain/components/types';
import type { WorkbenchProject } from '../../src/domain/project';

const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
function masksFromCurrents(currents: Record<string, number>): number[] {
  return [1, 2, 3, 4].map((digit) => segments.reduce((mask, segment, bit) =>
    mask | ((currents[`DISPLAY1:digit${digit}:${segment}`] ?? 0) > 0.00005 ? 1 << bit : 0), 0));
}

function disconnectPin(project: WorkbenchProject, id: string, pin: string): void {
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const occupiedStrips = new Set(project.components.flatMap(terminalEntries).map(([, hole]) => board.holes.find((candidate) => candidate.id === hole)!.stripId));
  const free = board.holes.find((hole) => hole.kind === 'terminal' && !occupiedStrips.has(hole.stripId));
  if (!free) throw new Error('No spare strip for disconnection test.');
  const part = project.components.find((component) => component.id === id)!;
  (part.terminalHoleIds as Record<string, string>)[pin] = free.id;
}

describe('wired digital thermometer', () => {
  it('executes firmware and lights segments from measured TMP36 voltage', () => {
    const project = createStarterProject('digital-thermometer');
    const extraction = extractCircuit(project);
    expect(extraction.errors).toEqual([]);
    const run = runTransient(extraction.circuit, { durationSeconds: 0.012, timeStepSeconds: 0.0001 });
    expect(run.result.errors).toEqual([]);
    const sensor = extraction.componentTerminalNodes.TMP1;
    expect(run.result.nodeVoltages[sensor.vout] - run.result.nodeVoltages[sensor.gnd]).toBeCloseTo(0.75, 4);
    expect(run.state.digital?.mcus.MCU1.cpu.cycles).toBeGreaterThan(10_000);
    expect(Object.entries(run.result.displayCurrentsA ?? {}).filter(([id, current]) => id.startsWith('DISPLAY1:') && current > 1e-5).length).toBeGreaterThan(5);
    expect(createTransientState(extraction.circuit, run.state).digital?.mcus.MCU1.cpu.cycles).toBe(run.state.digital?.mcus.MCU1.cpu.cycles);
  }, 60_000);

  it.each(['W-clock-', 'W-latch-', 'W-cascade-'])('requires physical connection %s', (prefix) => {
    const project = createStarterProject('digital-thermometer');
    project.components = project.components.filter((part) => !part.id.startsWith(prefix));
    const extraction = extractCircuit(project);
    expect(extraction.errors).toEqual([]);
    const run = runTransient(extraction.circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    expect(run.result.errors).toEqual([]);
    expect(masksFromCurrents(run.result.displayCurrentsA ?? {})).toEqual([0, 0, 0, 0]);
  }, 60_000);

  it.each([['MCU1', 'pin8'], ['MCU1', 'pin4'], ['MCU1', 'pin1'], ['SR2', 'pin16']])('does not light with %s.%s disconnected', (id, pin) => {
    const project = createStarterProject('digital-thermometer');
    disconnectPin(project, id, pin);
    const extraction = extractCircuit(project);
    expect(extraction.errors).toEqual([]);
    const run = runTransient(extraction.circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    expect(run.result.errors).toEqual([]);
    expect(masksFromCurrents(run.result.displayCurrentsA ?? {})).toEqual([0, 0, 0, 0]);
  }, 60_000);

  it('uses sensor supply wiring rather than the workbench power flag', () => {
    const project = createStarterProject('digital-thermometer');
    disconnectPin(project, 'TMP1', 'vs');
    const extraction = extractCircuit(project);
    const run = runTransient(extraction.circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    expect(run.result.errors).toEqual([]);
    expect(run.result.nodeVoltages[extraction.componentTerminalNodes.TMP1.vout]).toBeLessThan(0.01);
    expect(masksFromCurrents(run.result.displayCurrentsA ?? {})).toEqual([0x40, 0x6d, 0xbf, 0x3f]); // ADC zero -> -50.0 C
  }, 60_000);

  it('turns off, decays optical persistence, and restarts when supply returns', () => {
    const project = createStarterProject('digital-thermometer');
    let circuit = extractCircuit(project).circuit;
    const lit = runTransient(circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    project.powerOn = false;
    circuit = extractCircuit(project).circuit;
    const off = runTransient(circuit, { durationSeconds: 0.2, timeStepSeconds: 0.005, initialState: lit.state });
    expect(off.result.errors).toEqual([]);
    expect(masksFromCurrents(off.result.displayCurrentsA ?? {})).toEqual([0, 0, 0, 0]);
    expect(off.state.digital?.mcus.MCU1.cpu.cycles).toBe(0);
    project.powerOn = true;
    project.environment.temperatureC = 59;
    circuit = extractCircuit(project).circuit;
    const restarted = runTransient(circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001, initialState: off.state });
    expect(restarted.result.errors).toEqual([]);
    expect(masksFromCurrents(restarted.result.displayCurrentsA ?? {})).toEqual([0, 0x6d, 0xef, 0x3f]);
  }, 60_000);

  it.each([
    [59, [0, 0x6d, 0xef, 0x3f]], // 59.0, ADC code 223
    [-10, [0, 0x40, 0xef, 0x6f]], // -9.9 C, ADC code 82
    [0, [0, 0x40, 0xbf, 0x06]], // -0.1 C, ADC code 102
  ])('decodes temperature %s using only display junction currents', (temperatureC, expected) => {
    const project = createStarterProject('digital-thermometer');
    project.environment.temperatureC = temperatureC;
    const circuit = extractCircuit(migrateProjectDocument(JSON.parse(JSON.stringify(project)))).circuit;
    const run = runTransient(circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    expect(run.result.errors).toEqual([]);
    expect(masksFromCurrents(run.result.displayCurrentsA ?? {})).toEqual(expected);
  }, 60_000);

  it('uses the same GPIO event timing with the starter 1 ms step and finer 100 us steps', () => {
    const project = createStarterProject('digital-thermometer');
    project.environment.temperatureC = 59;
    const circuit = extractCircuit(project).circuit;
    const fine = runTransient(circuit, { durationSeconds: 0.009, timeStepSeconds: 0.0001 });
    const coarse = runTransient(circuit, { durationSeconds: 0.009, timeStepSeconds: project.simulation.timeStepSeconds });
    expect(coarse.result.errors).toEqual([]);
    expect(coarse.state.digital?.mcus.MCU1.cpu.cycles).toBe(fine.state.digital?.mcus.MCU1.cpu.cycles);
    expect(coarse.state.digital?.registers).toEqual(fine.state.digital?.registers);
    expect(masksFromCurrents(coarse.result.displayCurrentsA ?? {})).toEqual([0, 0x6d, 0xef, 0x3f]);
  }, 60_000);

  it('updates an already-running thermometer when ambient temperature changes', () => {
    const project = createStarterProject('digital-thermometer');
    const cold = runTransient(extractCircuit(project).circuit, { durationSeconds: 0.009, timeStepSeconds: 0.001 });
    project.environment.temperatureC = 59;
    const warm = runTransient(extractCircuit(project).circuit, { durationSeconds: 0.018, timeStepSeconds: 0.001, initialState: cold.state });
    expect(warm.result.errors).toEqual([]);
    const recentCurrents: Record<string, number> = {};
    for (const sample of warm.samples.slice(-8)) for (const [id, value] of Object.entries(sample.componentCurrents)) {
      recentCurrents[id] = Math.max(recentCurrents[id] ?? 0, value);
    }
    expect(masksFromCurrents(recentCurrents)).toEqual([0, 0x6d, 0xef, 0x3f]);
    expect(warm.state.timeSeconds).toBeCloseTo(0.027, 8);
  }, 60_000);

  it('rejects an excessive time step before executing the firmware', () => {
    const circuit = extractCircuit(createStarterProject('digital-thermometer')).circuit;
    const state = createTransientState(circuit);
    const frame = stepTransient(circuit, state, 1);
    expect(frame.result.errors[0]?.code).toBe('DIGITAL_STEP_BUDGET');
    expect(frame.state).toBe(state);
    expect(state.digital?.mcus.MCU1.cpu.cycles).toBe(0);
  });
});
