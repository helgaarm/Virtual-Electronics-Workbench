import { describe, expect, it } from 'vitest';
import type { OscilloscopeChannelSettings } from '../../src/domain/instruments/types';
import type { CircuitExtraction } from '../../src/simulation/circuitBuilder';
import {
  decimateWaveform,
  latestRisingCrossing,
  latestThresholdCrossing,
  measureWaveform,
  oscilloscopeTrace,
  type WaveformPoint,
} from '../../src/measurement/oscilloscope';

function sineWave(frequencyHz: number, amplitudeV: number, offsetV: number): WaveformPoint[] {
  const timeStepSeconds = 0.0001;
  return Array.from({ length: 201 }, (_, index) => {
    const timeSeconds = index * timeStepSeconds;
    return {
      timeSeconds,
      voltageV: offsetV + amplitudeV * Math.sin(2 * Math.PI * frequencyHz * timeSeconds),
    };
  });
}

describe('oscilloscope waveform measurements', () => {
  it('calculates peak-to-peak, mean, RMS, period and frequency from real samples', () => {
    const measurements = measureWaveform(sineWave(100, 2, 0));
    expect(measurements?.peakToPeakV).toBeCloseTo(4, 3);
    expect(measurements?.meanV).toBeCloseTo(0, 2);
    expect(measurements?.rmsV).toBeCloseTo(Math.SQRT2, 2);
    expect(measurements?.periodSeconds).toBeCloseTo(0.01, 5);
    expect(measurements?.frequencyHz).toBeCloseTo(100, 3);
  });

  it('does not invent a frequency when fewer than two rising edges exist', () => {
    const measurements = measureWaveform([
      { timeSeconds: 0, voltageV: 0 },
      { timeSeconds: 1, voltageV: 1 },
      { timeSeconds: 2, voltageV: 0 },
    ]);
    expect(measurements?.frequencyHz).toBeUndefined();
    expect(measurements?.periodSeconds).toBeUndefined();
  });

  it('extracts differential samples within the requested window', () => {
    const channel: OscilloscopeChannelSettings = {
      id: 'ch1', label: 'CH1', enabled: true, voltsPerDivisionV: 1, verticalOffsetV: 0,
      positiveHoleId: 'board:A1', referenceHoleId: 'board:A2',
    };
    const extraction: CircuitExtraction = {
      circuit: {
        nodes: [{ id: 'positive' }, { id: 'reference' }],
        groundNodeId: 'reference',
        components: [],
      },
      holeToNodeId: { 'board:A1': 'positive', 'board:A2': 'reference' },
      componentTerminalNodes: {},
      warnings: [],
      errors: [],
    };
    const samples = [0, 1, 2].map((timeSeconds) => ({
      timeSeconds,
      nodeVoltages: { positive: timeSeconds + 2, reference: 1 },
      componentCurrents: {},
    }));
    const trace = oscilloscopeTrace(channel, extraction, samples, 2, 1);
    expect(trace.status).toBe('valid');
    expect(trace.points).toEqual([
      { timeSeconds: 1, voltageV: 2 },
      { timeSeconds: 2, voltageV: 3 },
    ]);
  });

  it('interpolates the latest permitted rising crossing', () => {
    const points = [
      { timeSeconds: 0, voltageV: -1 },
      { timeSeconds: 1, voltageV: 1 },
      { timeSeconds: 2, voltageV: -1 },
      { timeSeconds: 3, voltageV: 1 },
    ];
    expect(latestRisingCrossing(points, 0, 2.49)).toBeCloseTo(0.5, 10);
    expect(latestRisingCrossing(points, 0, 3)).toBeCloseTo(2.5, 10);
    expect(latestThresholdCrossing(points, 0, 'falling', 3)).toBeCloseTo(1.5, 10);
  });

  it('bounds display vertices while preserving narrow extrema', () => {
    const points = Array.from({ length: 10_000 }, (_, index) => ({
      timeSeconds: index,
      voltageV: index === 5_001 ? 100 : 0,
    }));
    const decimated = decimateWaveform(points, 1_000);
    expect(decimated.length).toBeLessThanOrEqual(1_000);
    expect(decimated.some((point) => point.voltageV === 100)).toBe(true);
  });
});
