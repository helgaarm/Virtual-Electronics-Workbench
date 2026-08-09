import type { TransientSample } from '../domain/circuit/types';
import type {
  LogicAnalyserChannelSettings,
  OscilloscopeTriggerEdge,
} from '../domain/instruments/types';
import type { CircuitExtraction } from '../simulation/circuitBuilder';

export type DigitalLevel = 'low' | 'high' | 'undefined';

export interface DigitalPoint {
  timeSeconds: number;
  voltageV: number;
  level: DigitalLevel;
}

export interface DigitalTrace {
  status: 'valid' | 'disconnected' | 'unavailable';
  points: DigitalPoint[];
  reason?: string;
}

export function classifyDigitalVoltage(
  voltageV: number,
  lowThresholdV: number,
  highThresholdV: number,
): DigitalLevel {
  if (voltageV < lowThresholdV) return 'low';
  if (voltageV > highThresholdV) return 'high';
  return 'undefined';
}

export function logicAnalyserTrace(
  channel: LogicAnalyserChannelSettings,
  referenceHoleId: string | undefined,
  extraction: CircuitExtraction,
  samples: readonly TransientSample[],
  startTimeSeconds: number,
  endTimeSeconds: number,
  sampleRateHz: number,
  lowThresholdV: number,
  highThresholdV: number,
): DigitalTrace {
  if (!channel.inputHoleId || !referenceHoleId) {
    return {
      status: 'disconnected',
      points: [],
      reason: `Attach ${channel.label} and the analyser reference lead.`,
    };
  }
  const inputNodeId = extraction.holeToNodeId[channel.inputHoleId];
  const referenceNodeId = extraction.holeToNodeId[referenceHoleId];
  if (!inputNodeId || !referenceNodeId) {
    return { status: 'disconnected', points: [], reason: 'A lead is not on this board.' };
  }
  const intervalSeconds = 1 / sampleRateHz;
  let nextSampleTime = startTimeSeconds;
  const points: DigitalPoint[] = [];
  for (const sample of samples) {
    if (sample.timeSeconds < startTimeSeconds || sample.timeSeconds > endTimeSeconds) continue;
    if (sample.timeSeconds + Number.EPSILON < nextSampleTime) continue;
    const inputV = sample.nodeVoltages[inputNodeId];
    const referenceV = sample.nodeVoltages[referenceNodeId];
    if (inputV === undefined || referenceV === undefined) continue;
    const voltageV = inputV - referenceV;
    points.push({
      timeSeconds: sample.timeSeconds,
      voltageV,
      level: classifyDigitalVoltage(voltageV, lowThresholdV, highThresholdV),
    });
    nextSampleTime = sample.timeSeconds + intervalSeconds;
  }
  return points.length > 0
    ? { status: 'valid', points }
    : { status: 'unavailable', points, reason: 'Run the shared simulation to capture samples.' };
}

export function latestDigitalTrigger(
  points: readonly DigitalPoint[],
  edge: OscilloscopeTriggerEdge,
  notAfterSeconds = Number.POSITIVE_INFINITY,
): number | undefined {
  let previousDefined: DigitalPoint | undefined;
  let latest: number | undefined;
  for (const point of points) {
    if (point.level === 'undefined') continue;
    if (previousDefined) {
      const crosses = edge === 'rising'
        ? previousDefined.level === 'low' && point.level === 'high'
        : previousDefined.level === 'high' && point.level === 'low';
      if (crosses && point.timeSeconds <= notAfterSeconds) latest = point.timeSeconds;
    }
    previousDefined = point;
  }
  return latest;
}
