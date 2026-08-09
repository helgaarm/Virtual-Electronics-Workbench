import type { TransientSample } from '../domain/circuit/types';
import type { FrequencyCounterSettings } from '../domain/instruments/types';
import type { CircuitExtraction } from '../simulation/circuitBuilder';
import { thresholdCrossingTimes, type WaveformPoint } from './oscilloscope';

export interface FrequencyCounterReading {
  status: 'valid' | 'disconnected' | 'waiting';
  frequencyHz?: number;
  periodSeconds?: number;
  pulseCount: number;
  reason?: string;
}

export function frequencyCounterWaveform(
  settings: FrequencyCounterSettings,
  extraction: CircuitExtraction,
  samples: readonly TransientSample[],
): WaveformPoint[] {
  if (!settings.inputHoleId || !settings.referenceHoleId) return [];
  const inputNodeId = extraction.holeToNodeId[settings.inputHoleId];
  const referenceNodeId = extraction.holeToNodeId[settings.referenceHoleId];
  if (!inputNodeId || !referenceNodeId) return [];
  return samples.flatMap((sample) => {
    const inputV = sample.nodeVoltages[inputNodeId];
    const referenceV = sample.nodeVoltages[referenceNodeId];
    return inputV === undefined || referenceV === undefined
      ? []
      : [{ timeSeconds: sample.timeSeconds, voltageV: inputV - referenceV }];
  });
}

export function measureFrequencyCounter(
  settings: FrequencyCounterSettings,
  extraction: CircuitExtraction,
  samples: readonly TransientSample[],
): FrequencyCounterReading {
  if (!settings.inputHoleId || !settings.referenceHoleId) {
    return {
      status: 'disconnected',
      pulseCount: 0,
      reason: 'Attach the input and reference leads to breadboard holes.',
    };
  }
  const points = frequencyCounterWaveform(settings, extraction, samples);
  const crossings = thresholdCrossingTimes(points, settings.triggerLevelV, settings.triggerEdge);
  if (crossings.length < 2) {
    return {
      status: 'waiting',
      pulseCount: crossings.length,
      reason: points.length === 0
        ? 'Run the shared simulation to capture this input.'
        : 'Waiting for two threshold crossings.',
    };
  }
  const periods = crossings.slice(1).map((crossing, index) => crossing - crossings[index]);
  const periodSeconds = periods.reduce((sum, period) => sum + period, 0) / periods.length;
  return {
    status: 'valid',
    frequencyHz: 1 / periodSeconds,
    periodSeconds,
    pulseCount: crossings.length,
  };
}
