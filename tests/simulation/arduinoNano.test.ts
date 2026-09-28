import { describe, expect, it } from 'vitest';
import type { ArduinoNanoComponent } from '../../src/domain/components/types';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { validateOccupancy, validatePackageOverlaps } from '../../src/domain/physical/occupancy';
import { arduinoNanoProject } from '../../src/domain/starters/arduinoNano';
import { createEmptyProject, PROJECT_SCHEMA_VERSION } from '../../src/domain/project';
import { createPlacedComponent, movePlacedComponent, rotatePlacedComponent } from '../../src/state/workbenchActions';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientState, stepTransient } from '../../src/simulation';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';

describe('classic Arduino Nano', () => {
  it('fits real 2.54 mm headers across 15 columns and preserves pin order when moved/rotated', () => {
    const board = createBreadboardDefinition();
    const nano = createPlacedComponent('arduino-nano', board, []) as ArduinoNanoComponent;
    expect(Object.keys(nano.terminalHoleIds)).toHaveLength(30);
    expect(validateOccupancy(board, [nano])).toEqual([]);
    const position = (pin: number) => board.holes.find((h) => h.id === nano.terminalHoleIds[`pin${pin}`])!.positionMm;
    expect(position(2).x - position(1).x).toBeCloseTo(2.54);
    expect(position(30).z - position(1).z).toBeCloseTo(15.24);
    expect(validateOccupancy(board, [rotatePlacedComponent(board, nano, [nano])!])).toEqual([]);
    expect(validateOccupancy(board, [movePlacedComponent(board, nano, 'main:D5', [nano])!])).toEqual([]);
    expect(createPlacedComponent('arduino-nano', createBreadboardDefinition('small', 10), [])).toBeUndefined();
    const bad = { ...nano, terminalHoleIds: { ...nano.terminalHoleIds, pin16: 'main:J18' } };
    expect(validateOccupancy(board, [bad]).some((issue) => issue.code === 'INVALID_PACKAGE_PLACEMENT')).toBe(true);
  });

  it.each(['blink', 'button-led', 'analog-threshold'] as const)('has a valid, collision-free %s starter and survives persistence', (program) => {
    const project = arduinoNanoProject(program);
    const board = createBreadboardDefinition();
    expect(validateOccupancy(board, project.components)).toEqual([]);
    expect(validatePackageOverlaps(board, project.components)).toEqual([]);
    expect(migrateProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const drawing = buildSchematic(project).components.find((c) => c.kind === 'arduino-nano')!;
    expect(drawing.pins.find((p) => p.id === 'pin16')?.name).toBe('16 D13');
    expect(drawing.pins.find((p) => p.id === 'pin4')?.netId).toBe(drawing.pins.find((p) => p.id === 'pin29')?.netId);
  });

  it('migrates version 12 without changing parts and rejects unknown programs and distorted pin maps', () => {
    const old = { ...createEmptyProject(), version: 12 };
    expect(migrateProjectDocument(old)).toEqual({ ...old, version: PROJECT_SCHEMA_VERSION });
    const project = arduinoNanoProject('blink');
    const nano = project.components[0] as ArduinoNanoComponent;
    expect(() => migrateProjectDocument({ ...project, components: [{ ...nano, programId: 'execute-arbitrary-code' }] })).toThrow();
    expect(() => migrateProjectDocument({ ...project, components: [{ ...nano, terminalHoleIds: { ...nano.terminalHoleIds, pin16: 'main:J18' } }] })).toThrow();
  });

  it('blinks real loaded D13 and LED currents on the shared clock, without mutating snapshots', () => {
    const { circuit, componentTerminalNodes } = extractCircuit(arduinoNanoProject('blink'));
    const initial = createTransientState(circuit);
    const copy = structuredClone(initial);
    const on = stepTransient(circuit, initial, 0.005);
    expect(on.result.errors).toEqual([]);
    expect(initial).toEqual(copy);
    expect(on.result.componentCurrents.D1).toBeGreaterThan(0.005);
    expect(on.result.componentCurrents['Nano1:led']).toBeGreaterThan(0.001);
    const outputV = on.result.nodeVoltages[componentTerminalNodes.Nano1.pin16];
    expect(outputV).toBeGreaterThan(4);
    expect(outputV).toBeLessThan(4.9); // finite output drive under load
    const off = stepTransient(circuit, on.state, 1.01);
    expect(off.result.errors).toEqual([]);
    expect(off.result.componentCurrents.D1).toBe(0);
    const again = stepTransient(circuit, off.state, 1);
    expect(again.result.componentCurrents.D1).toBeGreaterThan(0.005);
    expect(stepTransient(circuit, structuredClone(on.state), 1.01)).toEqual(off);
  });

  it('reads a real switch using the D2 pull-up and drives the breadboard LED', () => {
    const project = arduinoNanoProject('button-led');
    const open = extractCircuit(project);
    const frame = stepTransient(open.circuit, createTransientState(open.circuit), 0.005);
    expect(frame.result.errors).toEqual([]);
    expect(frame.result.componentCurrents.D1).toBe(0);
    expect(frame.result.nodeVoltages[open.componentTerminalNodes.Nano1.pin5]).toBeGreaterThan(4.9);
    project.components = project.components.map((c) => c.kind === 'switch' ? { ...c, closed: true } : c);
    const closed = extractCircuit(project);
    const pressed = stepTransient(closed.circuit, createTransientState(closed.circuit, frame.state), 0.005);
    expect(pressed.result.errors).toEqual([]);
    expect(pressed.result.componentCurrents.D1).toBeGreaterThan(0.005);
    expect(pressed.result.nodeVoltages[closed.componentTerminalNodes.Nano1.pin5]).toBeCloseTo(0);
  });

  it('samples the potentiometer voltage through the 10-bit A0 input', () => {
    const project = arduinoNanoProject('analog-threshold');
    const outputAt = (position: number) => {
      project.components = project.components.map((c) => c.kind === 'potentiometer' ? { ...c, wiperPosition: position } : c);
      const extraction = extractCircuit(project);
      const frame = stepTransient(extraction.circuit, createTransientState(extraction.circuit), 0.005);
      expect(frame.result.errors).toEqual([]);
      return { input: frame.result.nodeVoltages[extraction.componentTerminalNodes.Nano1.pin19], current: frame.result.componentCurrents.D1 };
    };
    const first = outputAt(0.2); const second = outputAt(0.8);
    expect(Math.min(first.input, second.input)).toBeCloseTo(1, 2);
    expect(Math.max(first.input, second.input)).toBeCloseTo(4, 2);
    expect(first.input > 2.5 ? first.current : second.current).toBeGreaterThan(0.005);
    expect(first.input < 2.5 ? first.current : second.current).toBe(0);
  });

  it('powers off, respects RESET, and restarts when program or power changes', () => {
    const project = arduinoNanoProject('blink');
    const circuit = extractCircuit(project).circuit;
    const on = stepTransient(circuit, createTransientState(circuit), 0.01);
    project.powerOn = false;
    const offCircuit = extractCircuit(project).circuit;
    const off = stepTransient(offCircuit, createTransientState(offCircuit, on.state), 0.01);
    expect(off.result.errors).toEqual([]);
    expect(off.result.componentCurrents.D1).toBe(0);
    expect(off.state.digital?.nanos.Nano1.powered).toBe(false);
    const restarted = stepTransient(circuit, createTransientState(circuit, off.state), 0.01);
    expect(restarted.result.componentCurrents.D1).toBeGreaterThan(0.005);
    project.powerOn = true;
    project.components.push({ id: 'reset', label: 'Reset', kind: 'jumper-wire', rotation: 0, color: 'black', terminalHoleIds: { a: 'main:A5', b: 'main:B6' } });
    const resetCircuit = extractCircuit(project).circuit;
    const reset = stepTransient(resetCircuit, createTransientState(resetCircuit, restarted.state), 0.01);
    expect(reset.result.errors).toEqual([]);
    expect(reset.state.digital?.nanos.Nano1.powered).toBe(false);
    expect(reset.result.componentCurrents.D1).toBe(0);
    const changed = extractCircuit(arduinoNanoProject('button-led')).circuit;
    const changedState = stepTransient(changed, createTransientState(changed, restarted.state), 0.005);
    expect(changedState.state.digital?.nanos.Nano1.programId).toBe('button-led');
    expect(changedState.result.componentCurrents.D1).toBe(0);
  });
});
