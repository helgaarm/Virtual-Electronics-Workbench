import type { TransientSample } from '../domain/circuit/types';
import type {
  OscilloscopeChannelSettings,
  OscilloscopeTriggerEdge,
} from '../domain/instruments/types';
import type { CircuitExtraction } from '../simulation/circuitBuilder';

export interface WaveformPoint {
  timeSeconds: number;
  voltageV: number;
}

export interface OscilloscopeTrace {
  status: 'valid' | 'disconnected' | 'unavailable';
  points: WaveformPoint[];
  reason?: string;
}

export interface WaveformMeasurements {
  minimumV: number;
  maximumV: number;
  peakToPeakV: number;
  meanV: number;
  rmsV: number;
  frequencyHz?: number;
  periodSeconds?: number;
}

export function decimateWaveform(
  points: readonly WaveformPoint[],
  maximumPoints: number,
): WaveformPoint[] {
  if (maximumPoints <= 0) return [];
  if (points.length <= maximumPoints) return [...points];
  if (maximumPoints < 4) {
    return Array.from({ length: Math.max(1, maximumPoints) }, (_, index) => (
      points[Math.round(index * (points.length - 1) / Math.max(1, maximumPoints - 1))]
    ));
  }
  const result: WaveformPoint[] = [points[0]];
  const bucketCount = Math.max(1, Math.floor((maximumPoints - 2) / 2));
  const middleLength = points.length - 2;
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * middleLength / bucketCount);
    const end = 1 + Math.floor((bucket + 1) * middleLength / bucketCount);
    if (start >= end) continue;
    let minimum = points[start];
    let maximum = points[start];
    for (let index = start + 1; index < end; index += 1) {
      if (points[index].voltageV < minimum.voltageV) minimum = points[index];
      if (points[index].voltageV > maximum.voltageV) maximum = points[index];
    }
    if (minimum.timeSeconds <= maximum.timeSeconds) result.push(minimum, maximum);
    else result.push(maximum, minimum);
  }
  result.push(points.at(-1)!);
  return result.slice(0, maximumPoints);
}

export function oscilloscopeTrace(
  channel: OscilloscopeChannelSettings,
  extraction: CircuitExtraction,
  samples: readonly TransientSample[],
  endTimeSeconds: number,
  durationSeconds: number,
): OscilloscopeTrace {
  if (!channel.positiveHoleId || !channel.referenceHoleId) {
    return {
      status: 'disconnected',
      points: [],
      reason: `Attach both ${channel.label} leads to breadboard holes.`,
    };
  }
  const positiveNodeId = extraction.holeToNodeId[channel.positiveHoleId];
  const referenceNodeId = extraction.holeToNodeId[channel.referenceHoleId];
  if (!positiveNodeId || !referenceNodeId) {
    return { status: 'disconnected', points: [], reason: 'A probe lead is not on this board.' };
  }
  const startTimeSeconds = endTimeSeconds - durationSeconds;
  const points = samples.flatMap((sample) => {
    if (sample.timeSeconds < startTimeSeconds || sample.timeSeconds > endTimeSeconds) return [];
    const positiveV = sample.nodeVoltages[positiveNodeId];
    const referenceV = sample.nodeVoltages[referenceNodeId];
    return positiveV === undefined || referenceV === undefined
      ? []
      : [{ timeSeconds: sample.timeSeconds, voltageV: positiveV - referenceV }];
  });
  return points.length > 0
    ? { status: 'valid', points }
    : {
        status: 'unavailable',
        points,
        reason: 'Run the transient simulation to capture samples for this channel.',
      };
}

function crossingTimes(
  points: readonly WaveformPoint[],
  thresholdV: number,
  edge: OscilloscopeTriggerEdge,
): number[] {
  const crossings: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const crosses = edge === 'rising'
      ? previous.voltageV <= thresholdV && current.voltageV > thresholdV
      : previous.voltageV >= thresholdV && current.voltageV < thresholdV;
    if (crosses) {
      const differenceV = current.voltageV - previous.voltageV;
      const fraction = differenceV === 0 ? 0 : (thresholdV - previous.voltageV) / differenceV;
      crossings.push(previous.timeSeconds + fraction * (current.timeSeconds - previous.timeSeconds));
    }
  }
  return crossings;
}

export function latestThresholdCrossing(
  points: readonly WaveformPoint[],
  thresholdV: number,
  edge: OscilloscopeTriggerEdge,
  notAfterSeconds = Number.POSITIVE_INFINITY,
): number | undefined {
  const crossings = crossingTimes(points, thresholdV, edge);
  for (let index = crossings.length - 1; index >= 0; index -= 1) {
    if (crossings[index] <= notAfterSeconds) return crossings[index];
  }
  return undefined;
}

export function latestRisingCrossing(
  points: readonly WaveformPoint[],
  thresholdV: number,
  notAfterSeconds = Number.POSITIVE_INFINITY,
): number | undefined {
  return latestThresholdCrossing(points, thresholdV, 'rising', notAfterSeconds);
}

export function measureWaveform(points: readonly WaveformPoint[]): WaveformMeasurements | undefined {
  if (points.length === 0) return undefined;
  let minimumV = Number.POSITIVE_INFINITY;
  let maximumV = Number.NEGATIVE_INFINITY;
  let totalV = 0;
  let totalSquaredV = 0;
  for (const point of points) {
    minimumV = Math.min(minimumV, point.voltageV);
    maximumV = Math.max(maximumV, point.voltageV);
    totalV += point.voltageV;
    totalSquaredV += point.voltageV * point.voltageV;
  }
  const thresholdV = (minimumV + maximumV) / 2;
  const crossings = crossingTimes(points, thresholdV, 'rising');
  const periods = crossings.slice(1).map((crossing, index) => crossing - crossings[index]);
  const periodSeconds = periods.length > 0
    ? periods.reduce((total, period) => total + period, 0) / periods.length
    : undefined;
  return {
    minimumV,
    maximumV,
    peakToPeakV: maximumV - minimumV,
    meanV: totalV / points.length,
    rmsV: Math.sqrt(totalSquaredV / points.length),
    ...(periodSeconds && periodSeconds > 0
      ? { periodSeconds, frequencyHz: 1 / periodSeconds }
      : {}),
  };
}
