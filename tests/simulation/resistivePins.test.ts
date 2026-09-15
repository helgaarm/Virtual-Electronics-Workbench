import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import { solveDC } from '../../src/simulation/dc/solveDC';
import { canRetainOperatingPoint, reduceResistivePins } from '../../src/simulation/transient/resistivePins';

describe('exact isolated resistive pin reduction', () => {
  it.each([false, true])('preserves node voltages, branch currents, source loading and power (reverse source: %s)', (reverse) => {
    const circuit: Circuit = {
      groundNodeId: 'g', nodes: ['g', 'v', 'ref', 'pin'].map((id) => ({ id })),
      components: [
        { id: 'supply', kind: 'voltage-source', positiveNodeId: reverse ? 'g' : 'v', negativeNodeId: reverse ? 'v' : 'g', voltageV: reverse ? -5 : 5 },
        { id: 'reference', kind: 'voltage-source', positiveNodeId: 'ref', negativeNodeId: 'v', voltageV: -3 },
        { id: 'r1', kind: 'resistor', positiveNodeId: 'v', negativeNodeId: 'pin', resistanceOhms: 1000 },
        { id: 'r2', kind: 'resistor', positiveNodeId: 'pin', negativeNodeId: 'g', resistanceOhms: 2000 },
        { id: 'r3', kind: 'resistor', positiveNodeId: 'pin', negativeNodeId: 'ref', resistanceOhms: 1000 },
      ],
    };
    const reference = solveDC(circuit);
    const reduction = reduceResistivePins(circuit);
    expect(reduction.circuit.components).toHaveLength(2);
    const result = reduction.restore(solveDC(reduction.circuit));
    expect(result.errors).toEqual([]);
    for (const key of ['nodeVoltages', 'componentCurrents', 'componentPowers'] as const) {
      for (const [id, value] of Object.entries(reference[key])) expect(result[key][id]).toBeCloseTo(value, 10);
    }
  });

  it('retains loaded and nonlinear pins in the solver', () => {
    const circuit: Circuit = { groundNodeId: 'g', nodes: ['g', 'v', 'pin'].map((id) => ({ id })), components: [
      { id: 'supply', kind: 'voltage-source', positiveNodeId: 'v', negativeNodeId: 'g', voltageV: 5 },
      { id: 'r', kind: 'resistor', positiveNodeId: 'v', negativeNodeId: 'pin', resistanceOhms: 330 },
      { id: 'led', kind: 'led', positiveNodeId: 'pin', negativeNodeId: 'g', forwardVoltageV: 1.9, onResistanceOhms: 20 },
    ] };
    expect(reduceResistivePins(circuit).circuit.components).toEqual(circuit.components);
  });

  it('only reuses settled capacitors held across fixed voltages', () => {
    const circuit: Circuit = { groundNodeId: 'g', nodes: [], components: [
      { id: 'c', kind: 'capacitor', positiveNodeId: 'v', negativeNodeId: 'g', capacitanceFarads: 1e-7 },
    ] };
    const anchors = new Map([['g', 0], ['v', 5]]);
    expect(canRetainOperatingPoint(circuit, anchors, { c: 0 })).toBe(false);
    expect(canRetainOperatingPoint(circuit, anchors, { c: 5 })).toBe(true);
    expect(canRetainOperatingPoint(circuit, new Map([['g', 0]]), { c: 5 })).toBe(false);
  });
});
