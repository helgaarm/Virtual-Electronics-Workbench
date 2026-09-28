import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../../src/domain/starterProjects';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientState, stepTransient } from '../../src/simulation';
import { calibratedWindSpeed, DEFAULT_WIND_SETTINGS, ntcResistanceOhms, thermistorReading } from '../../src/domain/components/windSensor';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { validateOccupancy, validatePackageOverlaps } from '../../src/domain/physical/occupancy';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { SqliteProjectRepository } from '../../server/sqliteProjectRepository';
import { reconcileTransientRuntimeState, createTransientRuntimeState, stepTransientRuntimeState } from '../../src/simulation/transient/runtime';
import type { Circuit, TransientState } from '../../src/domain/circuit/types';

function advance(circuit: Circuit, initial: TransientState, seconds: number) {
  let frame = stepTransient(circuit, initial, 0.05);
  for (let t = 0.05; t < seconds - 1e-8; t += 0.05) frame = stepTransient(circuit, frame.state, 0.05);
  expect(frame.result.errors).toEqual([]); return frame;
}

describe('wind sensor starter and electrothermal model', () => {
  it.each(['wind-constant-power', 'wind-constant-temperature'] as const)('places and round-trips %s without collisions', id => {
    const project = createStarterProject(id); const board = createBreadboardDefinition(project.board.id, project.board.columns);
    expect(validateOccupancy(board, project.components)).toEqual([]);
    expect(validatePackageOverlaps(board, project.components)).toEqual([]);
    expect(migrateProjectDocument(project)).toEqual(project);
    const repository = new SqliteProjectRepository(':memory:');
    try { const saved = repository.save(project); expect(repository.get(project.id)).toEqual(saved); } finally { repository.close(); }
    const { componentTerminalNodes: pins } = extractCircuit(project);
    expect(pins.Nano1.pin19).toBe(pins['NTC-AIR'].a); expect(pins.Nano1.pin20).toBe(pins['NTC-HOT'].a);
    expect(pins.OLED1.sda).toBe(pins.Nano1.pin23); expect(pins.OLED1.scl).toBe(pins.Nano1.pin24);
    expect(pins.RH1.b).toBe(pins.Q1.drain); expect(pins.Q1.source).toBe(pins.Nano1.pin4);
  });
  it('uses Beta conversion, handles ADC faults, and interpolates only measured bounds', () => {
    expect(ntcResistanceOhms(25, 10000, 25, 3950)).toBe(10000);
    const resistance = ntcResistanceOhms(45, 10000, 25, 3950);
    expect(thermistorReading(1023 * resistance / (resistance + 10000), 10000, DEFAULT_WIND_SETTINGS)?.temperatureC).toBeCloseTo(45, 8);
    for (const value of [0, 1, 1022, 1023, NaN]) expect(thermistorReading(value, 10000, DEFAULT_WIND_SETTINGS)).toBeUndefined();
    const points = [{ speedMps: 0, signal: 20 }, { speedMps: 2, signal: 10 }, { speedMps: 6, signal: 5 }];
    expect(calibratedWindSpeed(15, points, false)).toBe(1);
    expect(calibratedWindSpeed(5, points, false)).toBe(6);
    expect(calibratedWindSpeed(21, points, false)).toBeUndefined();
    expect(calibratedWindSpeed(9, [], false)).toBeUndefined();
    expect(calibratedWindSpeed(15, points, true)).toBeUndefined();
  });
  it('heats from actual power, cools in airflow, and leaves wind uncalibrated', () => {
    const project = createStarterProject('wind-constant-power'); const circuit = extractCircuit(project).circuit;
    const warm = advance(circuit, createTransientState(circuit), 45);
    expect(warm.state.sensorTemperaturesC!['NTC-HOT']).toBeGreaterThan(40);
    expect(warm.state.sensorTemperaturesC!['NTC-AIR']).toBeLessThan(20.2);
    expect(warm.result.componentPowers.RH1).toBeCloseTo(25 * 150 / (155 * 155), 3);
    expect(warm.state.digital!.nanos.Nano1.wind!.speedMps).toBeUndefined();
    expect(warm.result.oledDisplays?.OLED1.pixels.some(x => x !== 0)).toBe(true);
    const windyCircuit = extractCircuit({ ...project, environment: { ...project.environment, windSpeedMps: 4 } }).circuit;
    const windy = advance(windyCircuit, warm.state, 30);
    expect(windy.state.digital!.nanos.Nano1.wind!.deltaC).toBeLessThan(warm.state.digital!.nanos.Nano1.wind!.deltaC - 8);
    const unpowered = advance(extractCircuit({ ...project, powerOn: false }).circuit, windy.state, 30);
    expect(unpowered.result.componentPowers.RH1).toBeLessThan(1e-9);
    expect(unpowered.state.sensorTemperaturesC!['NTC-HOT']).toBeLessThan(windy.state.sensorTemperaturesC!['NTC-HOT']);
    expect(unpowered.result.oledDisplays?.OLED1.powered).toBe(false);
  }, 20000);
  it('regulates temperature with finite PWM power and reports insufficient heater power', () => {
    const project = createStarterProject('wind-constant-temperature'); const circuit = extractCircuit(project).circuit;
    const warm = advance(circuit, createTransientState(circuit), 100);
    expect(warm.state.digital!.nanos.Nano1.wind!.deltaC).toBeCloseTo(20, 0);
    expect(warm.state.digital!.nanos.Nano1.wind!.duty).toBeGreaterThan(0.5);
    expect(warm.state.digital!.nanos.Nano1.wind!.duty).toBeLessThan(0.98);
    const windy = advance(extractCircuit({ ...project, environment: { ...project.environment, windSpeedMps: 6 } }).circuit, warm.state, 40);
    expect(windy.state.digital!.nanos.Nano1.wind!.status).toBe('HEATER LIMIT');
    expect(windy.state.digital!.nanos.Nano1.wind!.speedMps).toBeUndefined();
  }, 20000);
  it('turns a 2N7000 OFF at zero gate voltage, and refuses a broken thermistor/OLED wire', () => {
    const project = createStarterProject('wind-constant-temperature');
    project.components = project.components.filter(c => c.id !== 'W-A1' && c.id !== 'W-SDA');
    const circuit = extractCircuit(project).circuit;
    const frame = advance(circuit, createTransientState(circuit), 0.2);
    expect(frame.state.digital!.nanos.Nano1.wind!.status).toBe('SENSOR FAULT');
    expect(frame.state.digital!.nanos.Nano1.wind!.duty).toBe(0);
    expect(frame.result.componentPowers.RH1).toBeLessThan(1e-7);
    expect(frame.result.oledDisplays?.OLED1.powered).toBe(false);
    const repaired = extractCircuit(createStarterProject('wind-constant-temperature')).circuit;
    const latched = advance(repaired, frame.state, 0.2);
    expect(latched.state.digital!.nanos.Nano1.wind!.duty).toBe(0);
    expect(latched.result.componentPowers.RH1).toBeLessThan(1e-7);
    expect(latched.state.digital!.nanos.Nano1.wind!.fault).toBe(true);
  });
  it('retains digital and thermal state through topology reconciliation and cloned continuation', () => {
    const project = createStarterProject('wind-constant-temperature'); const circuit = extractCircuit(project).circuit;
    let runtime = createTransientRuntimeState(circuit, project.simulation, false);
    runtime = stepTransientRuntimeState(runtime, circuit);
    const reconciled = reconcileTransientRuntimeState(runtime, circuit, project.simulation, false, [], true, true);
    expect(reconciled.frame!.state.digital).toEqual(runtime.frame!.state.digital);
    expect(reconciled.frame!.state.sensorTemperaturesC).toEqual(runtime.frame!.state.sensorTemperaturesC);
    const previous = structuredClone(reconciled.frame!.state);
    const a = stepTransient(circuit, reconciled.frame!.state, 0.005);
    const b = stepTransient(circuit, structuredClone(previous), 0.005);
    expect(a).toEqual(b); expect(reconciled.frame!.state).toEqual(previous);
  });
  it('rejects malformed calibration and preserves older project documents', () => {
    const project = createStarterProject('wind-constant-power');
    const nano = project.components.find(c => c.kind === 'arduino-nano')!;
    if (nano.kind !== 'arduino-nano') throw new Error('Missing Nano');
    nano.windSettings!.calibration = [{ speedMps: 0, signal: 12 }, { speedMps: 1, signal: 12 }];
    expect(() => migrateProjectDocument(project)).toThrow(/calibration/);
    const old = createStarterProject('nano-blink');
    expect(migrateProjectDocument({ ...old, version: 14 }).version).toBe(15);
  });
});
