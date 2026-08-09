import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import {
  createTransientRuntimeState,
  reconcileTransientRuntimeState,
  stepTransientRuntimeState,
} from '../../src/state/useTransientRuntime';

function rcCircuit(sourceVoltageV = 5): Circuit {
  return {
    nodes: ['gnd', 'input', 'cap'].map((id) => ({ id })),
    groundNodeId: 'gnd',
    components: [
      {
        id: 'V1', kind: 'voltage-source', positiveNodeId: 'input',
        negativeNodeId: 'gnd', voltageV: sourceVoltageV,
      },
      {
        id: 'R1', kind: 'resistor', positiveNodeId: 'input',
        negativeNodeId: 'cap', resistanceOhms: 10_000,
      },
      {
        id: 'C1', kind: 'capacitor', positiveNodeId: 'cap',
        negativeNodeId: 'gnd', capacitanceFarads: 100e-6,
      },
    ],
  };
}

const settings = { timeStepSeconds: 0.005, speed: 1 };

describe('transient runtime state transitions', () => {
  it('resets to zero time and zero capacitor voltage while paused', () => {
    const reset = createTransientRuntimeState(rcCircuit(), settings, false);
    expect(reset.clock.status).toBe('paused');
    expect(reset.clock.timeSeconds).toBe(0);
    expect(reset.frame?.state.timeSeconds).toBe(0);
    expect(reset.frame?.state.capacitorVoltages.C1).toBe(0);
    expect(reset.frame?.result.nodeVoltages.cap).toBeCloseTo(0, 6);
  });

  it('single-steps exactly once and remains paused', () => {
    const reset = createTransientRuntimeState(rcCircuit(), settings, false);
    const stepped = stepTransientRuntimeState(reset, rcCircuit());
    expect(stepped.clock.status).toBe('paused');
    expect(stepped.clock.timeSeconds).toBe(settings.timeStepSeconds);
    expect(stepped.frame?.state.timeSeconds).toBe(settings.timeStepSeconds);
    expect(stepped.frame?.state.capacitorVoltages.C1).toBeGreaterThan(0);
  });

  it('changes runtime settings without advancing a paused capacitor', () => {
    const stepped = stepTransientRuntimeState(
      createTransientRuntimeState(rcCircuit(), settings, false),
      rcCircuit(),
    );
    const reconciled = reconcileTransientRuntimeState(
      stepped,
      rcCircuit(),
      { timeStepSeconds: 0.05, speed: 0.25 },
      false,
    );
    expect(reconciled.clock.status).toBe('paused');
    expect(reconciled.clock.timeSeconds).toBe(stepped.clock.timeSeconds);
    expect(reconciled.frame?.state).toEqual(stepped.frame?.state);
  });

  it('preserves charge across output changes and clears it for project resets', () => {
    const charged = stepTransientRuntimeState(
      createTransientRuntimeState(rcCircuit(), settings, false),
      rcCircuit(),
    );
    const outputOff = reconcileTransientRuntimeState(charged, rcCircuit(0), settings, false);
    expect(outputOff.frame?.state).toEqual(charged.frame?.state);

    const newProject = reconcileTransientRuntimeState(charged, rcCircuit(), settings, true);
    expect(newProject.clock.status).toBe('running');
    expect(newProject.clock.timeSeconds).toBe(0);
    expect(newProject.frame?.state.capacitorVoltages.C1).toBe(0);
  });
});
