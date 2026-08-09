import type { MeasurementProbe, ProbeTerminal } from '../domain/project';

export function createMeasurementProbe(
  existing: readonly MeasurementProbe[],
  id = `probe-${globalThis.crypto.randomUUID()}`,
): MeasurementProbe {
  const usedLabels = new Set(existing.map((probe) => probe.label));
  let number = 1;
  while (usedLabels.has(`Voltage ${number}`)) number += 1;
  return {
    id,
    label: `Voltage ${number}`,
    instrumentId: 'multimeter',
  };
}

export function setProbeConnection(
  probe: MeasurementProbe,
  terminal: ProbeTerminal,
  holeId: string | undefined,
): MeasurementProbe {
  const key = terminal === 'positive' ? 'positiveHoleId' : 'referenceHoleId';
  const next = { ...probe };
  if (holeId) next[key] = holeId;
  else delete next[key];
  return next;
}

export function swapProbeConnections(probe: MeasurementProbe): MeasurementProbe {
  const next: MeasurementProbe = {
    id: probe.id,
    label: probe.label,
    instrumentId: probe.instrumentId,
  };
  if (probe.referenceHoleId) next.positiveHoleId = probe.referenceHoleId;
  if (probe.positiveHoleId) next.referenceHoleId = probe.positiveHoleId;
  return next;
}

export function probeConnection(
  probe: MeasurementProbe | undefined,
  terminal: ProbeTerminal,
): string | undefined {
  return terminal === 'positive' ? probe?.positiveHoleId : probe?.referenceHoleId;
}
