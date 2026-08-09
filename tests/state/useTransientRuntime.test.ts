import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import { createNe555Subcircuit } from '../../src/simulation/models/ne555';
import { subcircuitScopedId } from '../../src/simulation/subcircuits';
import {
  createTransientRuntimeState,
  hardResetCapacitorRuntimeState,
  reconcileTransientRuntimeState,
  runTransientRuntimeSteps,
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

function twoCapacitorCircuit(): Circuit {
  const first = rcCircuit();
  return {
    ...first,
    nodes: [...first.nodes, { id: 'cap2' }],
    components: [
      ...first.components,
      {
        id: 'R2', kind: 'resistor', positiveNodeId: 'input',
        negativeNodeId: 'cap2', resistanceOhms: 20_000,
      },
      {
        id: 'C2', kind: 'capacitor', positiveNodeId: 'cap2',
        negativeNodeId: 'gnd', capacitanceFarads: 47e-6,
      },
    ],
  };
}

function latchCircuit(triggerV: number, thresholdV: number, resetV = 5): Circuit {
  const nodes = ['gnd', 'vcc', 'trigger', 'output', 'reset', 'control', 'threshold', 'discharge'];
  return {
    nodes: nodes.map((id) => ({ id })),
    groundNodeId: 'gnd',
    components: [
      { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: 'gnd', voltageV: 5 },
      { id: 'VTRIG', kind: 'voltage-source', positiveNodeId: 'trigger', negativeNodeId: 'gnd', voltageV: triggerV },
      { id: 'VTHRESH', kind: 'voltage-source', positiveNodeId: 'threshold', negativeNodeId: 'gnd', voltageV: thresholdV },
      { id: 'VRESET', kind: 'voltage-source', positiveNodeId: 'reset', negativeNodeId: 'gnd', voltageV: resetV },
      { id: 'RLOAD', kind: 'resistor', positiveNodeId: 'output', negativeNodeId: 'gnd', resistanceOhms: 1_000 },
      createNe555Subcircuit('U1', {
        gnd: 'gnd', trigger: 'trigger', output: 'output', reset: 'reset', control: 'control',
        threshold: 'threshold', discharge: 'discharge', vcc: 'vcc',
      }),
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

  it('hard-resets only the selected capacitor and pauses without resetting time', () => {
    const circuit = twoCapacitorCircuit();
    const charged = stepTransientRuntimeState(
      createTransientRuntimeState(circuit, settings, false),
      circuit,
    );
    const reset = hardResetCapacitorRuntimeState(charged, circuit, settings, 'C1');

    expect(charged.frame?.state.capacitorVoltages.C1).toBeGreaterThan(0);
    expect(charged.frame?.state.capacitorVoltages.C2).toBeGreaterThan(0);
    expect(reset.clock.status).toBe('paused');
    expect(reset.clock.timeSeconds).toBe(charged.clock.timeSeconds);
    expect(reset.frame?.state.capacitorVoltages.C1).toBe(0);
    expect(reset.frame?.state.capacitorVoltages.C2)
      .toBe(charged.frame?.state.capacitorVoltages.C2);
  });

  it('runs and captures requested nodes for a generator without a capacitor', () => {
    const circuit: Circuit = {
      nodes: [{ id: 'gnd' }, { id: 'out' }],
      groundNodeId: 'gnd',
      components: [{
        id: 'GEN', kind: 'signal-source', positiveNodeId: 'out', negativeNodeId: 'gnd',
        waveform: 'sine', frequencyHz: 1, amplitudeVpp: 2, offsetV: 0,
      }],
    };
    const initial = createTransientRuntimeState(circuit, settings, false, ['out', 'gnd']);
    const stepped = stepTransientRuntimeState(initial, circuit, ['out', 'gnd']);
    expect(stepped.clock.timeSeconds).toBe(settings.timeStepSeconds);
    expect(stepped.samples.at(-1)?.nodeVoltages.out).toBeCloseTo(
      Math.sin(2 * Math.PI * settings.timeStepSeconds),
      8,
    );
  });

  it('starts a timeline for a capacitor inside a reusable subcircuit', () => {
    const circuit: Circuit = {
      nodes: [{ id: 'gnd' }, { id: 'out' }],
      groundNodeId: 'gnd',
      components: [
        { id: 'V1', kind: 'voltage-source', positiveNodeId: 'out', negativeNodeId: 'gnd', voltageV: 5 },
        {
          id: 'X1',
          kind: 'subcircuit',
          externalNodes: { out: 'out', ground: 'gnd' },
          definition: {
            externalNodeIds: ['out', 'ground'],
            internalNodeIds: [],
            components: [{
              id: 'C1',
              kind: 'capacitor',
              positiveNodeId: 'out',
              negativeNodeId: 'ground',
              capacitanceFarads: 1e-6,
            }],
          },
        },
      ],
    };
    const runtime = createTransientRuntimeState(circuit, settings, false);
    expect(runtime.frame).toBeDefined();
    expect(runtime.frame?.state.capacitorVoltages[subcircuitScopedId('X1', 'C1')]).toBe(0);
  });

  it('retains a stateful subcircuit latch through hold and topology reconciliation', () => {
    const setCircuit = latchCircuit(0, 0);
    const set = stepTransientRuntimeState(
      createTransientRuntimeState(setCircuit, settings, false),
      setCircuit,
    );
    expect(set.frame?.result.nodeVoltages.output).toBeGreaterThan(3);
    const heldSet = reconcileTransientRuntimeState(
      set,
      latchCircuit(2.5, 2.5),
      settings,
      false,
      [],
      true,
      true,
    );
    expect(heldSet.frame?.result.nodeVoltages.output).toBeGreaterThan(3);

    const resetCircuit = latchCircuit(0, 0, 0);
    const reset = stepTransientRuntimeState(
      createTransientRuntimeState(resetCircuit, settings, false),
      resetCircuit,
    );
    expect(reset.frame?.result.nodeVoltages.output).toBeLessThan(1);
    const heldReset = reconcileTransientRuntimeState(
      reset,
      latchCircuit(2.5, 2.5),
      settings,
      false,
      [],
      true,
      true,
    );
    expect(heldReset.frame?.result.nodeVoltages.output).toBeLessThan(1);
  });

  it('captures a flat DC timeline when oscilloscope nodes request it', () => {
    const circuit: Circuit = {
      nodes: [{ id: 'gnd' }, { id: 'out' }],
      groundNodeId: 'gnd',
      components: [{
        id: 'V1', kind: 'voltage-source', positiveNodeId: 'out',
        negativeNodeId: 'gnd', voltageV: 5,
      }],
    };
    const initial = createTransientRuntimeState(circuit, settings, false, ['out', 'gnd']);
    const stepped = stepTransientRuntimeState(initial, circuit, ['out', 'gnd']);
    expect(stepped.samples.map((sample) => sample.nodeVoltages.out)).toEqual([5, 5]);
  });

  it('clears incompatible capture history when topology changes', () => {
    const circuit = rcCircuit();
    const initial = stepTransientRuntimeState(
      createTransientRuntimeState(circuit, settings, false, ['cap']),
      circuit,
      ['cap'],
    );
    const reconciled = reconcileTransientRuntimeState(
      initial,
      circuit,
      settings,
      false,
      ['cap'],
      true,
      true,
    );
    expect(initial.samples).toHaveLength(2);
    expect(reconciled.samples).toHaveLength(1);
    expect(reconciled.frame?.state.nodeVoltages).toBeUndefined();
  });

  it('bounds a single capture to one requested screen span', () => {
    const circuit = rcCircuit();
    const initial = createTransientRuntimeState(circuit, settings, false, ['cap']);
    const endTimeSeconds = initial.clock.timeSeconds + 0.015;
    const batch = runTransientRuntimeSteps(initial, circuit, ['cap'], 100, endTimeSeconds);
    expect(batch.singleCaptureComplete).toBe(true);
    expect(batch.frame.state.timeSeconds).toBeCloseTo(0.015, 10);
    expect(batch.samples).toHaveLength(3);
  });
});
