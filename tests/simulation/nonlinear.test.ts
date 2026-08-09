import { describe, expect, it } from 'vitest';
import type {
  Circuit,
  ElectricalBjt,
  ElectricalDiode,
  ElectricalSubcircuitDefinition,
} from '../../src/domain/circuit/types';
import { solveDC } from '../../src/simulation/dc/solveDC';
import { flattenCircuit, subcircuitScopedId } from '../../src/simulation/subcircuits';
import { runTransient } from '../../src/simulation/transient/solveTransient';

const junctionModel = {
  saturationCurrentA: 1e-14,
  emissionCoefficient: 1,
  temperatureK: 298.15,
};

function diode(id: string, positiveNodeId: string, negativeNodeId: string): ElectricalDiode {
  return { id, kind: 'diode', positiveNodeId, negativeNodeId, model: { ...junctionModel } };
}

function bjt(
  id: string,
  polarity: 'npn' | 'pnp',
  collectorNodeId: string,
  baseNodeId: string,
  emitterNodeId: string,
): ElectricalBjt {
  return {
    id,
    kind: 'bjt',
    polarity,
    collectorNodeId,
    baseNodeId,
    emitterNodeId,
    model: { ...junctionModel, forwardBeta: 100, reverseBeta: 2 },
  };
}

function lowLeakageBjt(
  id: string,
  collectorNodeId: string,
  baseNodeId: string,
  saturationCurrentA = 1e-15,
): ElectricalBjt {
  const transistor = bjt(id, 'npn', collectorNodeId, baseNodeId, '0');
  transistor.model.saturationCurrentA = saturationCurrentA;
  return transistor;
}

function diodeCircuit(supplyV: number): Circuit {
  return {
    nodes: ['0', 'supply', 'junction'].map((id) => ({ id })),
    groundNodeId: '0',
    components: [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'supply', negativeNodeId: '0', voltageV: supplyV },
      { id: 'R1', kind: 'resistor', positiveNodeId: 'supply', negativeNodeId: 'junction', resistanceOhms: 1_000 },
      diode('D1', 'junction', '0'),
    ],
  };
}

function npnSwitch(baseVoltageV: number): Circuit {
  return {
    nodes: ['0', 'vcc', 'collector', 'base'].map((id) => ({ id })),
    groundNodeId: '0',
    components: [
      { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: 5 },
      { id: 'VB', kind: 'voltage-source', positiveNodeId: 'base', negativeNodeId: '0', voltageV: baseVoltageV },
      { id: 'RC', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'collector', resistanceOhms: 1_000 },
      bjt('Q1', 'npn', 'collector', 'base', '0'),
    ],
  };
}

describe('nonlinear semiconductor solver', () => {
  it('solves smooth Shockley-diode forward conduction and reverse blocking', () => {
    const forward = solveDC(diodeCircuit(5));
    const lowerForward = solveDC(diodeCircuit(1));
    const reverse = solveDC(diodeCircuit(-5));

    expect(forward.status).not.toBe('error');
    expect(forward.nodeVoltages.junction).toBeGreaterThan(0.5);
    expect(forward.nodeVoltages.junction).toBeLessThan(1);
    expect(forward.componentCurrents.D1).toBeGreaterThan(0.004);
    expect(forward.componentCurrents.D1).toBeCloseTo(
      (5 - forward.nodeVoltages.junction) / 1_000,
      7,
    );
    expect(lowerForward.componentCurrents.D1).toBeGreaterThan(0);
    expect(lowerForward.componentCurrents.D1).toBeLessThan(forward.componentCurrents.D1);
    expect(reverse.componentCurrents.D1).toBeCloseTo(-junctionModel.saturationCurrentA, 14);
  });

  it('protects the device exponential at extreme forward voltage', () => {
    const result = solveDC({
      nodes: ['0', 'high'].map((id) => ({ id })),
      groundNodeId: '0',
      components: [
        { id: 'V1', kind: 'voltage-source', positiveNodeId: 'high', negativeNodeId: '0', voltageV: 100 },
        diode('D1', 'high', '0'),
      ],
    });
    expect(result.errors).toEqual([]);
    expect(Number.isFinite(result.componentCurrents.D1)).toBe(true);
  });

  it('models NPN cutoff, active gain, and saturation', () => {
    const off = solveDC(npnSwitch(0));
    const active = solveDC(npnSwitch(0.65));
    const saturated = solveDC(npnSwitch(0.8));

    expect(off.nodeVoltages.collector).toBeCloseTo(5, 4);
    expect(active.nodeVoltages.collector).toBeLessThan(4.5);
    expect(active.componentCurrents.Q1).toBeGreaterThan(0.0001);
    expect(saturated.nodeVoltages.collector).toBeLessThan(1);
    expect(saturated.componentCurrents.Q1).toBeGreaterThan(active.componentCurrents.Q1);
  });

  it('produces common-emitter voltage gain around a bias point', () => {
    const lower = solveDC(npnSwitch(0.62));
    const upper = solveDC(npnSwitch(0.621));
    const outputChangeV = Math.abs(upper.nodeVoltages.collector - lower.nodeVoltages.collector);
    expect(outputChangeV).toBeGreaterThan(0.01);
  });

  it('produces an emitter-follower output below its driven base', () => {
    const circuit: Circuit = {
      nodes: ['0', 'vcc', 'base', 'emitter'].map((id) => ({ id })),
      groundNodeId: '0',
      components: [
        { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: 5 },
        { id: 'VB', kind: 'voltage-source', positiveNodeId: 'base', negativeNodeId: '0', voltageV: 2 },
        { id: 'RE', kind: 'resistor', positiveNodeId: 'emitter', negativeNodeId: '0', resistanceOhms: 1_000 },
        bjt('Q1', 'npn', 'vcc', 'base', 'emitter'),
      ],
    };
    const result = solveDC(circuit);
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.emitter).toBeGreaterThan(1);
    expect(result.nodeVoltages.emitter).toBeLessThan(result.nodeVoltages.base);
    expect(result.componentCurrents.RE).toBeGreaterThan(0.001);
  });

  it('models PNP polarity correctly', () => {
    const circuit: Circuit = {
      nodes: ['0', 'vcc', 'collector', 'base'].map((id) => ({ id })),
      groundNodeId: '0',
      components: [
        { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: 5 },
        { id: 'VB', kind: 'voltage-source', positiveNodeId: 'base', negativeNodeId: '0', voltageV: 4.35 },
        { id: 'RC', kind: 'resistor', positiveNodeId: 'collector', negativeNodeId: '0', resistanceOhms: 1_000 },
        bjt('Q1', 'pnp', 'collector', 'base', 'vcc'),
      ],
    };
    const result = solveDC(circuit);
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.collector).toBeGreaterThan(0.1);
    expect(result.componentCurrents.Q1).toBeLessThan(0);
  });

  it('reports invalid models deterministically', () => {
    const circuit = diodeCircuit(5);
    const device = circuit.components[2];
    if (device.kind !== 'diode') throw new Error('Fixture is not a diode.');
    device.model.saturationCurrentA = 0;
    const first = solveDC(circuit);
    const second = solveDC(circuit);
    expect(first.errors[0]?.code).toBe('INVALID_SEMICONDUCTOR_PARAMETERS');
    expect(second.errors).toEqual(first.errors);
  });

  it('expands reusable internal subcircuits without exposing physical holes', () => {
    const circuit: Circuit = {
      nodes: ['0', 'vcc', 'out'].map((id) => ({ id })),
      groundNodeId: '0',
      components: [
        { id: 'V1', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: 5 },
        { id: 'X1::D', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'out', resistanceOhms: 1_000_000 },
        {
          id: 'X1',
          kind: 'subcircuit',
          externalNodes: { input: 'vcc', output: 'out', ground: '0' },
          definition: {
            externalNodeIds: ['input', 'output', 'ground'],
            internalNodeIds: [],
            components: [
              { id: 'RIN', kind: 'resistor', positiveNodeId: 'input', negativeNodeId: 'output', resistanceOhms: 1_000 },
              diode('D', 'output', 'ground'),
            ],
          },
        },
      ],
    };
    const result = solveDC(circuit);
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.out).toBeGreaterThan(0.5);
    expect(result.componentCurrents['X1::D']).toBeGreaterThan(0);
    expect(result.componentCurrents[subcircuitScopedId('X1', 'D')]).toBeGreaterThan(0.004);
  });

  it('rejects cyclic or incompletely bound developer-authored subcircuits', () => {
    const cyclicDefinition: ElectricalSubcircuitDefinition = {
      externalNodeIds: ['io'],
      internalNodeIds: [],
      components: [],
    };
    cyclicDefinition.components.push({
      id: 'nested',
      kind: 'subcircuit',
      externalNodes: { io: 'io' },
      definition: cyclicDefinition,
    });
    expect(() => flattenCircuit({
      nodes: [{ id: '0' }],
      groundNodeId: '0',
      components: [{
        id: 'X1',
        kind: 'subcircuit',
        externalNodes: { io: '0' },
        definition: cyclicDefinition,
      }],
    })).toThrow(/cyclic definition/);

    expect(() => flattenCircuit({
      nodes: [{ id: '0' }],
      groundNodeId: '0',
      components: [{
        id: 'X2',
        kind: 'subcircuit',
        externalNodes: {},
        definition: {
          externalNodeIds: ['required'],
          internalNodeIds: [],
          components: [],
        },
      }],
    })).toThrow(/missing external pin required/);
  });

  it('uses the previous transient solution and preserves state on a failed step', () => {
    const circuit = diodeCircuit(5);
    circuit.components.push({
      id: 'C1',
      kind: 'capacitor',
      positiveNodeId: 'junction',
      negativeNodeId: '0',
      capacitanceFarads: 1e-6,
    });
    const run = runTransient(circuit, { durationSeconds: 0.01, timeStepSeconds: 0.001 });
    expect(run.result.errors, JSON.stringify(run.result.diagnostics)).toEqual([]);
    expect(run.state.nodeVoltages?.junction).toBeDefined();
    const snapshot = structuredClone(run.state);
    const failed = runTransient(circuit, {
      durationSeconds: 0.001,
      timeStepSeconds: Number.NaN,
      initialState: run.state,
    });
    expect(failed.result.errors[0]?.code).toBe('INVALID_TIME_STEP');
    expect(failed.state).toEqual(snapshot);
  });

  it('sustains a classic two-transistor astable multivibrator', () => {
    const circuit: Circuit = {
      nodes: ['0', 'vcc', 'c1', 'c2', 'b1', 'b2'].map((id) => ({ id })),
      groundNodeId: '0',
      components: [
        { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: 3 },
        { id: 'RC1', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'c1', resistanceOhms: 10_000 },
        { id: 'RC2', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'c2', resistanceOhms: 10_000 },
        { id: 'RB1', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'b1', resistanceOhms: 100_000 },
        { id: 'RB2', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'b2', resistanceOhms: 100_000 },
        { id: 'RBE1', kind: 'resistor', positiveNodeId: 'b1', negativeNodeId: '0', resistanceOhms: 1_000_000 },
        { id: 'RBE2', kind: 'resistor', positiveNodeId: 'b2', negativeNodeId: '0', resistanceOhms: 1_000_000 },
        { id: 'C1', kind: 'capacitor', positiveNodeId: 'c1', negativeNodeId: 'b2', capacitanceFarads: 1e-6 },
        { id: 'C2', kind: 'capacitor', positiveNodeId: 'c2', negativeNodeId: 'b1', capacitanceFarads: 1e-6 },
        lowLeakageBjt('Q1', 'c1', 'b1'),
        lowLeakageBjt('Q2', 'c2', 'b2', 1.1e-15),
      ],
    };
    const run = runTransient(circuit, {
      durationSeconds: 0.5,
      timeStepSeconds: 0.0005,
      initialState: {
        timeSeconds: 0,
        capacitorVoltages: { C1: 0.001, C2: 0 },
        nodeVoltages: { b1: 0.01, b2: 0, c1: 3, c2: 2.99 },
      },
    });
    expect(run.result.errors, JSON.stringify(run.result.diagnostics)).toEqual([]);
    const differences = run.samples.map((sample) => sample.nodeVoltages.c1 - sample.nodeVoltages.c2);
    const signChanges = differences.slice(1).filter(
      (difference, index) => difference * differences[index] < 0,
    ).length;
    expect(signChanges).toBeGreaterThanOrEqual(4);
    expect(Math.max(...differences)).toBeGreaterThan(1);
    expect(Math.min(...differences)).toBeLessThan(-1);
  });
});
