import { PCB_FOOTPRINTS } from './footprints';
import type { PcbComponent, PcbPointMm } from './types';

export function rotatePoint(point: PcbPointMm, degrees: 0 | 90 | 180 | 270): PcbPointMm {
  switch (degrees) {
    case 0: return point;
    case 90: return { xMm: -point.yMm, yMm: point.xMm };
    case 180: return { xMm: -point.xMm, yMm: -point.yMm };
    case 270: return { xMm: point.yMm, yMm: -point.xMm };
  }
}

export function padPosition(component: PcbComponent, padNumber: string): PcbPointMm | undefined {
  const pad = PCB_FOOTPRINTS[component.footprintId]?.pads.find((candidate) => candidate.number === padNumber);
  if (!pad) return undefined;
  const rotated = rotatePoint(pad.positionMm, component.rotationDegrees);
  return { xMm: component.positionMm.xMm + rotated.xMm, yMm: component.positionMm.yMm + rotated.yMm };
}

export function pointForViewedSide(point: PcbPointMm, boardWidthMm: number, side: 'top' | 'bottom'): PcbPointMm {
  return side === 'top' ? point : { xMm: boardWidthMm - point.xMm, yMm: point.yMm };
}

