import { describe, expect, it } from 'vitest';
import { connectedPadCount } from '../../src/domain/pcb/connectivity';
import { runPcbDrc } from '../../src/domain/pcb/drc';
import { exportKicadPcb } from '../../src/domain/pcb/exporters';
import { validateFootprintLibrary } from '../../src/domain/pcb/footprints';
import { DEFAULT_PCB_RULES, type PcbProject } from '../../src/domain/pcb/types';

function board(layerMode: 'single' | 'double' = 'double'): PcbProject {
  return { version: 2, sourceCircuitFingerprint: 'layers', board: { widthMm: 40, heightMm: 30, title: 'Layers', layerMode }, components: [
    { id: 'a', sourceComponentId: 'a', reference: 'A', value: 'R', footprintId: 'Axial-10mm', positionMm: { xMm: 12, yMm: 15 }, rotationDegrees: 0, locked: false },
  ], nets: [{ id: 'n', name: 'N', pads: [{ componentId: 'a', padNumber: '1', terminalId: 'a', sourceHoleId: 'h1' }, { componentId: 'a', padNumber: '2', terminalId: 'b', sourceHoleId: 'h2' }] }], traces: [], vias: [], jumpers: [], mountingHoles: [], rules: DEFAULT_PCB_RULES };
}

describe('layer-aware PCB copper', () => {
  it('requires a via to connect opposite-layer traces away from a plated pad', () => {
    const pcb = board(); pcb.traces = [
      { id: 'bottom', netId: 'n', layer: 'B.Cu', widthMm: .4, ownership: 'manual', pointsMm: [{ xMm: 7, yMm: 15 }, { xMm: 12, yMm: 10 }] },
      { id: 'front', netId: 'n', layer: 'F.Cu', widthMm: .4, ownership: 'manual', pointsMm: [{ xMm: 12, yMm: 10 }, { xMm: 17, yMm: 15 }] },
    ];
    expect(connectedPadCount(pcb, pcb.nets[0])).toBe(0);
    pcb.vias.push({ id: 'v1', netId: 'n', positionMm: { xMm: 12, yMm: 10 }, drillDiameterMm: .6, copperDiameterMm: 1.2, fromLayer: 'F.Cu', toLayer: 'B.Cu', ownership: 'manual' });
    expect(connectedPadCount(pcb, pcb.nets[0])).toBe(1);
    expect(exportKicadPcb(pcb)).toContain('(via (at 12 10) (size 1.2) (drill 0.6)');
  });

  it('allows different-layer crossings but rejects same-layer foreign-net crossings', () => {
    const pcb = board(); pcb.nets.push({ id: 'other', name: 'OTHER', pads: [] }); pcb.traces = [
      { id: 'a', netId: 'n', layer: 'F.Cu', widthMm: .4, ownership: 'manual', pointsMm: [{ xMm: 5, yMm: 10 }, { xMm: 25, yMm: 10 }] },
      { id: 'b', netId: 'other', layer: 'B.Cu', widthMm: .4, ownership: 'manual', pointsMm: [{ xMm: 15, yMm: 5 }, { xMm: 15, yMm: 20 }] },
    ]; expect(runPcbDrc(pcb).issues.some((issue) => issue.code === 'TRACK_TO_TRACK_CLEARANCE')).toBe(false);
    pcb.traces[1].layer = 'F.Cu'; expect(runPcbDrc(pcb).issues.map((issue) => issue.code)).toContain('TRACK_TO_TRACK_CLEARANCE');
  });

  it('rejects front copper and vias on a single-sided board', () => {
    const pcb = board('single'); pcb.traces.push({ id: 'front', netId: 'n', layer: 'F.Cu', widthMm: .4, ownership: 'manual', pointsMm: [{ xMm: 7, yMm: 15 }, { xMm: 17, yMm: 15 }] }); pcb.vias.push({ id: 'v', netId: 'n', positionMm: { xMm: 12, yMm: 15 }, drillDiameterMm: .6, copperDiameterMm: 1.2, fromLayer: 'F.Cu', toLayer: 'B.Cu', ownership: 'manual' });
    expect(runPcbDrc(pcb).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['INVALID_COPPER_LAYER', 'VIA_ON_SINGLE_SIDED_BOARD']));
  });

  it('validates every bundled footprint definition', () => { expect(validateFootprintLibrary()).toEqual([]); });
});
