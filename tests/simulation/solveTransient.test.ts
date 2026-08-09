import { describe, expect, it } from 'vitest';
import { signalSourceVoltageAtTime, type Circuit } from '../../src/domain/circuit/types';
import { createTransientState, runTransient, stepTransient } from '../../src/simulation';

function chargingCircuit(): Circuit {
  return {
    nodes: ['gnd', 'input', 'cap'].map((id) => ({ id })),
    groundNodeId: 'gnd',
    components: [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'input', negativeNodeId: 'gnd', voltageV: 5 },
      { id: 'R1', kind: 'resistor', positiveNodeId: 'input', negativeNodeId: 'cap', resistanceOhms: 10_000 },
      { id: 'C1', kind: 'capacitor', positiveNodeId: 'cap', negativeNodeId: 'gnd', capacitanceFarads: 100e-6 },
    ],
  };
}

function dischargingCircuit(): Circuit {
  return {
    nodes: ['gnd', 'cap'].map((id) => ({ id })),
    groundNodeId: 'gnd',
    components: [
      { id: 'R1', kind: 'resistor', positiveNodeId: 'cap', negativeNodeId: 'gnd', resistanceOhms: 10_000 },
      { id: 'C1', kind: 'capacitor', positiveNodeId: 'cap', negativeNodeId: 'gnd', capacitanceFarads: 100e-6 },
    ],
  };
}

describe('backward-Euler transient solver', () => {
  it('matches the analytical RC charging curve at one and five time constants', () => {
    const circuit = chargingCircuit();
    const atOneTau = runTransient(circuit, { durationSeconds: 1, timeStepSeconds: 0.001 });
    expect(atOneTau.state.timeSeconds).toBeCloseTo(1, 9);
    expect(atOneTau.state.capacitorVoltages.C1).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
    const atFiveTau = runTransient(circuit, { durationSeconds: 5, timeStepSeconds: 0.001 });
    expect(atFiveTau.state.capacitorVoltages.C1).toBeCloseTo(5 * (1 - Math.exp(-5)), 2);
  });

  it('matches exponential RC discharge from an initialized capacitor', () => {
    const circuit = dischargingCircuit();
    const initialState = { timeSeconds: 0, capacitorVoltages: { C1: 5 } };
    const run = runTransient(circuit, {
      durationSeconds: 1,
      timeStepSeconds: 0.001,
      initialState,
    });
    expect(run.state.capacitorVoltages.C1).toBeCloseTo(5 * Math.exp(-1), 2);
    expect(run.result.componentCurrents.C1).toBeLessThan(0);
  });

  it('uses a shortened final step to end at a non-integral requested duration', () => {
    const run = runTransient(chargingCircuit(), {
      durationSeconds: 0.0015,
      timeStepSeconds: 0.001,
    });
    expect(run.samples).toHaveLength(2);
    expect(run.state.timeSeconds).toBeCloseTo(0.0015, 12);
  });

  it('does not create a zero-length final step for floating-point whole ratios', () => {
    const run = runTransient(chargingCircuit(), {
      durationSeconds: 0.07,
      timeStepSeconds: 0.01,
    });
    expect(run.result.status).not.toBe('error');
    expect(run.samples).toHaveLength(7);
    expect(run.state.timeSeconds).toBeCloseTo(0.07, 12);
  });

  it('preserves capacitor voltage when circuit topology is reconciled', () => {
    const charged = runTransient(chargingCircuit(), { durationSeconds: 1, timeStepSeconds: 0.005 });
    const reconciled = createTransientState(dischargingCircuit(), charged.state);
    expect(reconciled.timeSeconds).toBe(charged.state.timeSeconds);
    expect(reconciled.capacitorVoltages.C1).toBe(charged.state.capacitorVoltages.C1);
  });

  it('reconciles multiple capacitor states strictly by component ID', () => {
    const circuit: Circuit = {
      nodes: ['gnd', 'a', 'b'].map((id) => ({ id })),
      groundNodeId: 'gnd',
      components: [
        {
          id: 'C3', kind: 'capacitor', positiveNodeId: 'a',
          negativeNodeId: 'gnd', capacitanceFarads: 1e-6,
        },
        {
          id: 'C2', kind: 'capacitor', positiveNodeId: 'b',
          negativeNodeId: 'gnd', capacitanceFarads: 2e-6,
        },
      ],
    };
    const reconciled = createTransientState(circuit, {
      timeSeconds: 1.25,
      capacitorVoltages: { C1: 1, C2: 2 },
    });
    expect(reconciled).toEqual({
      timeSeconds: 1.25,
      capacitorVoltages: { C3: 0, C2: 2 },
    });
  });

  it('returns structured errors for invalid transient input', () => {
    const circuit = chargingCircuit();
    expect(stepTransient(circuit, createTransientState(circuit), 0).result.errors[0].code)
      .toBe('INVALID_TIME_STEP');
    const invalid = {
      ...circuit,
      components: circuit.components.map((component) => component.kind === 'capacitor'
        ? { ...component, capacitanceFarads: 0 }
        : component),
    } as Circuit;
    expect(stepTransient(invalid, createTransientState(invalid), 0.001).result.errors[0].code)
      .toBe('INVALID_CAPACITANCE');
    expect(() => runTransient(circuit, { durationSeconds: 0, timeStepSeconds: 0.001 }))
      .toThrow(/positive/);
  });

  it('evaluates square and sine signal sources from simulation time', () => {
    const base = {
      waveform: 'square' as const,
      frequencyHz: 1,
      amplitudeVpp: 4,
      offsetV: 2,
    };
    expect(signalSourceVoltageAtTime(base, 0.25)).toBe(4);
    expect(signalSourceVoltageAtTime(base, 0.75)).toBe(0);
    expect(signalSourceVoltageAtTime({ ...base, waveform: 'sine' }, 0.25)).toBeCloseTo(4, 10);
    expect(signalSourceVoltageAtTime({ ...base, waveform: 'sine' }, 0.75)).toBeCloseTo(0, 10);
  });

  it('samples a dynamic source even when the circuit has no capacitor', () => {
    const circuit: Circuit = {
      nodes: [{ id: 'gnd' }, { id: 'out' }],
      groundNodeId: 'gnd',
      components: [{
        id: 'GEN',
        kind: 'signal-source',
        positiveNodeId: 'out',
        negativeNodeId: 'gnd',
        waveform: 'square',
        frequencyHz: 1,
        amplitudeVpp: 4,
        offsetV: 2,
      }],
    };
    const run = runTransient(circuit, { durationSeconds: 0.75, timeStepSeconds: 0.25 });
    expect(run.samples.map((sample) => sample.nodeVoltages.out)).toEqual([4, 0, 0]);
  });
});
