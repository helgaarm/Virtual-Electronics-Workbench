import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import { createLedExampleProject } from '../../src/domain/project';
import { simulateProject } from '../../src/simulation';
import { solveDC } from '../../src/simulation/dc/solveDC';

function circuit(nodes: string[], components: Circuit['components']): Circuit {
  return { nodes: nodes.map((id) => ({ id })), groundNodeId: 'gnd', components };
}

describe('MNA DC solver', () => {
  it('verifies Ohm’s law for 5 V across 1 kΩ', () => {
    const result = solveDC(circuit(['gnd', 'vcc'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: 'gnd', voltageV: 5 },
      { id: 'R1', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'gnd', resistanceOhms: 1_000 },
    ]));
    expect(result.status).toBe('ok');
    expect(result.nodeVoltages.vcc).toBeCloseTo(5, 9);
    expect(result.componentCurrents.R1).toBeCloseTo(0.005, 8);
    expect(result.componentCurrents.V1).toBeCloseTo(-0.005, 8);
    expect(result.componentPowers.V1).toBeCloseTo(-0.025, 8);
  });

  it('solves a 1 kΩ / 1 kΩ voltage divider', () => {
    const result = solveDC(circuit(['gnd', 'vcc', 'mid'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: 'gnd', voltageV: 5 },
      { id: 'R1', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'mid', resistanceOhms: 1_000 },
      { id: 'R2', kind: 'resistor', positiveNodeId: 'mid', negativeNodeId: 'gnd', resistanceOhms: 1_000 },
    ]));
    expect(result.nodeVoltages.mid).toBeCloseTo(2.5, 7);
    expect(result.componentCurrents.R1).toBeCloseTo(0.0025, 7);
  });

  it('returns a structured direct-short error', () => {
    const result = solveDC(circuit(['gnd'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'gnd', negativeNodeId: 'gnd', voltageV: 5 },
    ]));
    expect(result.status).toBe('error');
    expect(result.errors[0].code).toBe('DIRECT_SHORT');
  });

  it('ignores a redundant same-node zero-volt source without making MNA singular', () => {
    const result = solveDC(circuit(['gnd'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'gnd', negativeNodeId: 'gnd', voltageV: 0 },
    ]));
    expect(result.status).toBe('ok');
    expect(result.errors).toEqual([]);
    expect(result.componentCurrents.V1).toBe(0);
  });

  it('keeps a reverse-biased LED off', () => {
    const result = solveDC(circuit(['gnd', 'negative'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'negative', negativeNodeId: 'gnd', voltageV: -5 },
      { id: 'D1', kind: 'led', positiveNodeId: 'negative', negativeNodeId: 'gnd', forwardVoltageV: 1.9, onResistanceOhms: 12 },
    ]));
    expect(result.status).toBe('warning');
    expect(result.componentCurrents.D1).toBe(0);
    expect(result.iterations).toBe(1);
  });

  it('solves an empty grounded circuit without fabricating measurements', () => {
    const result = solveDC(circuit(['gnd'], []));
    expect(result.status).toBe('ok');
    expect(result.nodeVoltages).toEqual({ gnd: 0 });
    expect(result.componentCurrents).toEqual({});
  });

  it('treats capacitors as open circuits in DC analysis', () => {
    const result = solveDC(circuit(['gnd', 'vcc'], [
      { id: 'V1', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: 'gnd', voltageV: 5 },
      { id: 'C1', kind: 'capacitor', positiveNodeId: 'vcc', negativeNodeId: 'gnd', capacitanceFarads: 100e-6 },
    ]));
    expect(result.status).toBe('ok');
    expect(result.nodeVoltages.vcc).toBeCloseTo(5, 9);
    expect(result.componentCurrents.C1).toBe(0);
  });

  it('powers the starter LED and reacts to the physical switch', () => {
    const closedProject = createLedExampleProject();
    const closed = simulateProject(closedProject);
    expect(closed.result.errors).toEqual([]);
    expect(closed.result.componentCurrents.R1).toBeGreaterThan(0.01);
    expect(closed.result.componentCurrents.R1).toBeLessThan(0.02);

    const openProject = {
      ...closedProject,
      components: closedProject.components.map((component) =>
        component.kind === 'switch' ? { ...component, closed: false } : component,
      ),
    };
    const open = simulateProject(openProject);
    expect(Math.abs(open.result.componentCurrents.R1)).toBeLessThan(1e-8);
    expect(open.result.componentCurrents.D1).toBe(0);
  });
});
