import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/domain/circuit/types';
import { solveDC } from '../../src/simulation/dc/solveDC';
import { createNe555Subcircuit } from '../../src/simulation/models/ne555';
import { subcircuitScopedId } from '../../src/simulation/subcircuits';
import { runTransient } from '../../src/simulation/transient/solveTransient';

function timerCircuit({
  triggerV,
  thresholdV,
  resetV = 5,
  controlV,
  supplyV = 5,
}: {
  triggerV: number;
  thresholdV: number;
  resetV?: number;
  controlV?: number;
  supplyV?: number;
}): Circuit {
  const nodes = ['0', 'vcc', 'trigger', 'output', 'reset', 'control', 'threshold', 'discharge'];
  return {
    nodes: nodes.map((id) => ({ id })),
    groundNodeId: '0',
    components: [
      { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: supplyV },
      { id: 'VTRIG', kind: 'voltage-source', positiveNodeId: 'trigger', negativeNodeId: '0', voltageV: triggerV },
      { id: 'VTHRESH', kind: 'voltage-source', positiveNodeId: 'threshold', negativeNodeId: '0', voltageV: thresholdV },
      { id: 'VRESET', kind: 'voltage-source', positiveNodeId: 'reset', negativeNodeId: '0', voltageV: resetV },
      ...(controlV === undefined ? [] : [{
        id: 'VCONTROL',
        kind: 'voltage-source' as const,
        positiveNodeId: 'control',
        negativeNodeId: '0',
        voltageV: controlV,
      }]),
      { id: 'RLOAD', kind: 'resistor', positiveNodeId: 'output', negativeNodeId: '0', resistanceOhms: 1_000 },
      { id: 'RDIS', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'discharge', resistanceOhms: 10_000 },
      createNe555Subcircuit('U1', {
        gnd: '0',
        trigger: 'trigger',
        output: 'output',
        reset: 'reset',
        control: 'control',
        threshold: 'threshold',
        discharge: 'discharge',
        vcc: 'vcc',
      }),
    ],
  };
}

function astableCircuit(
  timingResistanceOhms = 10_000,
  resetV = 5,
  timingCapacitanceFarads = 1e-6,
  supplyV = 5,
): Circuit {
  const nodes = ['0', 'vcc', 'trigger-threshold', 'output', 'reset', 'control', 'discharge'];
  return {
    nodes: nodes.map((id) => ({ id })),
    groundNodeId: '0',
    components: [
      { id: 'VCC', kind: 'voltage-source', positiveNodeId: 'vcc', negativeNodeId: '0', voltageV: supplyV },
      { id: 'VRESET', kind: 'voltage-source', positiveNodeId: 'reset', negativeNodeId: '0', voltageV: resetV },
      { id: 'RA', kind: 'resistor', positiveNodeId: 'vcc', negativeNodeId: 'discharge', resistanceOhms: 10_000 },
      { id: 'RB', kind: 'resistor', positiveNodeId: 'discharge', negativeNodeId: 'trigger-threshold', resistanceOhms: timingResistanceOhms },
      { id: 'C', kind: 'capacitor', positiveNodeId: 'trigger-threshold', negativeNodeId: '0', capacitanceFarads: timingCapacitanceFarads },
      { id: 'RLOAD', kind: 'resistor', positiveNodeId: 'output', negativeNodeId: '0', resistanceOhms: 1_000 },
      createNe555Subcircuit('U1', {
        gnd: '0', trigger: 'trigger-threshold', output: 'output', reset: 'reset',
        control: 'control', threshold: 'trigger-threshold', discharge: 'discharge', vcc: 'vcc',
      }),
    ],
  };
}

function risingCrossings(samples: ReturnType<typeof runTransient>['samples']): number[] {
  const crossings: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1].nodeVoltages.output < 2 && samples[index].nodeVoltages.output >= 2) {
      crossings.push(samples[index].timeSeconds);
    }
  }
  return crossings;
}

describe('NE555 hybrid analogue subcircuit', () => {
  it('derives its comparator references from the three-resistor divider', () => {
    const result = solveDC(timerCircuit({ triggerV: 0, thresholdV: 0 }));
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.control).toBeCloseTo(10 / 3, 1);
    expect(result.nodeVoltages[subcircuitScopedId('U1', 'lower-ref')]).toBeCloseTo(5 / 3, 1);
  });

  it('sets the latch from a low trigger and releases the discharge transistor', () => {
    const result = solveDC(timerCircuit({ triggerV: 0, thresholdV: 0 }));
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.output).toBeGreaterThan(3);
    expect(result.nodeVoltages.discharge).toBeGreaterThan(3);
  });

  it('resets the latch above the upper threshold and enables discharge', () => {
    const result = solveDC(timerCircuit({ triggerV: 2.5, thresholdV: 4 }));
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.output).toBeLessThan(1);
    expect(result.nodeVoltages.discharge).toBeLessThan(1);
  });

  it('makes the electrical RESET input dominant', () => {
    const result = solveDC(timerCircuit({ triggerV: 0, thresholdV: 0, resetV: 0 }));
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages.output).toBeLessThan(1);
    expect(result.nodeVoltages.discharge).toBeLessThan(1);
  });

  it('releases RESET above 1 V even at the maximum supply', () => {
    const result = solveDC(timerCircuit({
      triggerV: 0,
      thresholdV: 0,
      resetV: 1.1,
      supplyV: 16,
    }));
    expect(result.errors).toEqual([]);
    expect(result.nodeVoltages[subcircuitScopedId('U1', 'reset-ref')]).toBeLessThan(1);
    expect(result.nodeVoltages.output).toBeGreaterThan(10);
  });

  it('allows CONTROL voltage to move the upper comparator threshold', () => {
    const defaultControl = solveDC(timerCircuit({ triggerV: 2.5, thresholdV: 2.5 }));
    const loweredControl = solveDC(timerCircuit({ triggerV: 2.5, thresholdV: 2.5, controlV: 2 }));
    expect(defaultControl.errors).toEqual([]);
    expect(loweredControl.errors).toEqual([]);
    expect(defaultControl.nodeVoltages[subcircuitScopedId('U1', 'threshold-assert')]).toBeLessThan(1);
    expect(loweredControl.nodeVoltages[subcircuitScopedId('U1', 'threshold-assert')]).toBeGreaterThan(1);
    expect(loweredControl.nodeVoltages.output).toBeLessThan(1);
  });

  it('oscillates naturally in the classic astable circuit and responds to R and RESET', () => {
    const fast = runTransient(astableCircuit(), { durationSeconds: 0.12, timeStepSeconds: 0.0002 });
    const slow = runTransient(astableCircuit(22_000), { durationSeconds: 0.12, timeStepSeconds: 0.0002 });
    const slowerCapacitor = runTransient(
      astableCircuit(10_000, 5, 2e-6),
      { durationSeconds: 0.12, timeStepSeconds: 0.0002 },
    );
    const reset = runTransient(astableCircuit(10_000, 0), { durationSeconds: 0.03, timeStepSeconds: 0.0002 });
    expect(fast.result.errors).toEqual([]);
    expect(slow.result.errors).toEqual([]);
    expect(slowerCapacitor.result.errors).toEqual([]);
    expect(reset.result.errors).toEqual([]);
    const fastCrossings = risingCrossings(fast.samples);
    const slowCrossings = risingCrossings(slow.samples);
    const slowerCapacitorCrossings = risingCrossings(slowerCapacitor.samples);
    expect(fastCrossings.length).toBeGreaterThanOrEqual(4);
    expect(slowCrossings.length).toBeLessThan(fastCrossings.length);
    expect(slowerCapacitorCrossings.length).toBeLessThan(fastCrossings.length);
    const stablePeriods = fastCrossings.slice(1)
      .map((crossing, index) => crossing - fastCrossings[index])
      .filter((period) => period > 0.01)
      .sort((left, right) => left - right);
    const periodSeconds = stablePeriods[Math.floor(stablePeriods.length / 2)];
    expect(1 / periodSeconds).toBeGreaterThan(20);
    expect(1 / periodSeconds).toBeLessThan(100);
    const timingVoltages = fast.samples.map((sample) => sample.nodeVoltages['trigger-threshold']);
    expect(Math.min(...timingVoltages)).toBeLessThan(2);
    expect(Math.max(...timingVoltages)).toBeGreaterThan(3);
    expect(Math.max(...reset.samples.map((sample) => sample.nodeVoltages.output))).toBeLessThan(1);
  });

  it('oscillates at the documented low and high supply limits', () => {
    const lowSupply = runTransient(
      astableCircuit(10_000, 4.5, 1e-6, 4.5),
      { durationSeconds: 0.12, timeStepSeconds: 0.0002 },
    );
    const highSupply = runTransient(
      astableCircuit(10_000, 16, 1e-6, 16),
      { durationSeconds: 0.12, timeStepSeconds: 0.0002 },
    );
    expect(lowSupply.result.errors).toEqual([]);
    expect(highSupply.result.errors).toEqual([]);
    expect(risingCrossings(lowSupply.samples).length).toBeGreaterThanOrEqual(3);
    expect(risingCrossings(highSupply.samples).length).toBeGreaterThanOrEqual(3);
  });
});
