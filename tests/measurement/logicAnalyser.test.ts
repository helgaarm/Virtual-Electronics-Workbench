import { describe, expect, it } from 'vitest';
import { createDefaultLogicAnalyserSettings } from '../../src/domain/instruments/types';
import {
  classifyDigitalVoltage,
  latestDigitalTrigger,
  logicAnalyserTrace,
} from '../../src/measurement/logicAnalyser';
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

describe('logic analyser measurement', () => {
  it('uses explicit TTL LOW, HIGH, and undefined bands', () => {
    expect(classifyDigitalVoltage(0.79, 0.8, 2)).toBe('low');
    expect(classifyDigitalVoltage(0.8, 0.8, 2)).toBe('undefined');
    expect(classifyDigitalVoltage(1.4, 0.8, 2)).toBe('undefined');
    expect(classifyDigitalVoltage(2, 0.8, 2)).toBe('undefined');
    expect(classifyDigitalVoltage(2.01, 0.8, 2)).toBe('high');
  });

  it('samples differential node voltage at the configured acquisition rate', () => {
    const channel = {
      ...createDefaultLogicAnalyserSettings().channels.ch1,
      inputHoleId: 'board:A1',
    };
    const samples = Array.from({ length: 11 }, (_, index) => ({
      timeSeconds: index * 0.001,
      nodeVoltages: { input: index < 5 ? 0 : 5, reference: 0.5 },
      componentCurrents: {},
    }));
    const trace = logicAnalyserTrace(
      channel,
      'board:A2',
      extraction,
      samples,
      0,
      0.01,
      500,
      0.8,
      2,
    );
    expect(trace.status).toBe('valid');
    expect(trace.points).toHaveLength(6);
    expect(trace.points.map((point) => point.level)).toEqual([
      'low', 'low', 'low', 'high', 'high', 'high',
    ]);
  });

  it('triggers only across definite states and ignores the undefined band', () => {
    const points = [
      { timeSeconds: 0, voltageV: 0, level: 'low' as const },
      { timeSeconds: 1, voltageV: 1.2, level: 'undefined' as const },
      { timeSeconds: 2, voltageV: 5, level: 'high' as const },
      { timeSeconds: 3, voltageV: 0, level: 'low' as const },
    ];
    expect(latestDigitalTrigger(points, 'rising')).toBe(2);
    expect(latestDigitalTrigger(points, 'falling')).toBe(3);
  });
});
