import { describe, expect, it } from 'vitest';
import type { MeasurementProbe } from '../../src/domain/project';
import {
  createMeasurementProbe,
  probeConnection,
  setProbeConnection,
  swapProbeConnections,
} from '../../src/state/probeActions';

const connectedProbe: MeasurementProbe = {
  id: 'probe-1',
  label: 'Voltage 1',
  instrumentId: 'multimeter',
  positiveHoleId: 'main:A1',
  referenceHoleId: 'main:B1',
};

describe('probe actions', () => {
  it('creates uniquely labelled disconnected multimeter probes', () => {
    const probe = createMeasurementProbe([connectedProbe], 'probe-2');
    expect(probe).toEqual({
      id: 'probe-2',
      label: 'Voltage 2',
      instrumentId: 'multimeter',
    });
  });

  it('connects and disconnects either terminal without mutating the source', () => {
    const moved = setProbeConnection(connectedProbe, 'positive', 'main:C2');
    expect(moved.positiveHoleId).toBe('main:C2');
    expect(connectedProbe.positiveHoleId).toBe('main:A1');
    expect(probeConnection(moved, 'positive')).toBe('main:C2');
    expect(setProbeConnection(moved, 'reference', undefined)).not.toHaveProperty('referenceHoleId');
  });

  it('swaps attached leads and preserves disconnected leads', () => {
    expect(swapProbeConnections(connectedProbe)).toMatchObject({
      positiveHoleId: 'main:B1',
      referenceHoleId: 'main:A1',
    });
    const positiveOnly = setProbeConnection(connectedProbe, 'reference', undefined);
    expect(swapProbeConnections(positiveOnly)).toEqual({
      id: connectedProbe.id,
      label: connectedProbe.label,
      instrumentId: 'multimeter',
      referenceHoleId: 'main:A1',
    });
  });
});
