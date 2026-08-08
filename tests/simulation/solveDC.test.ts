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
