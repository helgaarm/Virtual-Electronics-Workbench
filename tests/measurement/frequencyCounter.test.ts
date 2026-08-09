import { describe, expect, it } from 'vitest';
import { createDefaultFrequencyCounterSettings } from '../../src/domain/instruments/types';
import { measureFrequencyCounter } from '../../src/measurement/frequencyCounter';
import type { CircuitExtraction } from '../../src/simulation/circuitBuilder';

const extraction: CircuitExtraction = {
  circuit: {
    nodes: [{ id: 'input' }, { id: 'reference' }],
    groundNodeId: 'reference',
    components: [],
  },
  holeToNodeId: { 'board:A1': 'input', 'board:A2': 'reference' },
  componentTerminalNodes: {},
  warnings: [],
  errors: [],
};

describe('frequency counter measurement', () => {
  it('derives frequency and period from shared differential samples', () => {
    const settings = {
      ...createDefaultFrequencyCounterSettings(),
      inputHoleId: 'board:A1',
      referenceHoleId: 'board:A2',
      triggerLevelV: 2.5,
    };
    const samples = Array.from({ length: 41 }, (_, index) => ({
      timeSeconds: index * 0.00025,
      nodeVoltages: { input: index % 4 < 2 ? 0 : 5, reference: 0 },
      componentCurrents: {},
    }));
    const reading = measureFrequencyCounter(settings, extraction, samples);
    expect(reading.status).toBe('valid');
    expect(reading.frequencyHz).toBeCloseTo(1_000, 8);
    expect(reading.periodSeconds).toBeCloseTo(0.001, 10);
    expect(reading.pulseCount).toBe(10);
  });

  it('reports disconnected and waiting states without inventing a reading', () => {
    expect(measureFrequencyCounter(createDefaultFrequencyCounterSettings(), extraction, []))
      .toMatchObject({ status: 'disconnected', pulseCount: 0 });
    expect(measureFrequencyCounter({
      ...createDefaultFrequencyCounterSettings(),
      inputHoleId: 'board:A1',
      referenceHoleId: 'board:A2',
    }, extraction, []))
      .toMatchObject({ status: 'waiting', pulseCount: 0 });
  });
});
