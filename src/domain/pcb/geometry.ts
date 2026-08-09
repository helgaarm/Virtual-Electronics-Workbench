import { PCB_FOOTPRINTS } from './footprints';
import type { PcbComponent, PcbPointMm } from './types';

/** Geometry epsilon is deliberately much smaller than any supported fabrication rule. */
export const PCB_GEOMETRY_EPSILON_MM = 1e-6;
export interface PcbSegment { start: PcbPointMm; end: PcbPointMm }
export interface PcbRectMm { leftMm: number; topMm: number; rightMm: number; bottomMm: number }

export function distanceMm(a: PcbPointMm, b: PcbPointMm): number {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
}

export function pointToSegmentDistanceMm(point: PcbPointMm, segment: PcbSegment): number {
  const dx = segment.end.xMm - segment.start.xMm;
  const dy = segment.end.yMm - segment.start.yMm;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= PCB_GEOMETRY_EPSILON_MM) return distanceMm(point, segment.start);
  const t = Math.max(0, Math.min(1, ((point.xMm - segment.start.xMm) * dx + (point.yMm - segment.start.yMm) * dy) / lengthSquared));
  return distanceMm(point, { xMm: segment.start.xMm + t * dx, yMm: segment.start.yMm + t * dy });
}

function orientation(a: PcbPointMm, b: PcbPointMm, c: PcbPointMm): number {
  return (b.xMm - a.xMm) * (c.yMm - a.yMm) - (b.yMm - a.yMm) * (c.xMm - a.xMm);
}

export function segmentsIntersect(a: PcbSegment, b: PcbSegment): boolean {
  const o1 = orientation(a.start, a.end, b.start); const o2 = orientation(a.start, a.end, b.end);
  const o3 = orientation(b.start, b.end, a.start); const o4 = orientation(b.start, b.end, a.end);
  if (((o1 > PCB_GEOMETRY_EPSILON_MM && o2 < -PCB_GEOMETRY_EPSILON_MM) || (o1 < -PCB_GEOMETRY_EPSILON_MM && o2 > PCB_GEOMETRY_EPSILON_MM))
    && ((o3 > PCB_GEOMETRY_EPSILON_MM && o4 < -PCB_GEOMETRY_EPSILON_MM) || (o3 < -PCB_GEOMETRY_EPSILON_MM && o4 > PCB_GEOMETRY_EPSILON_MM))) return true;
  return Math.abs(o1) <= PCB_GEOMETRY_EPSILON_MM && pointToSegmentDistanceMm(b.start, a) <= PCB_GEOMETRY_EPSILON_MM
    || Math.abs(o2) <= PCB_GEOMETRY_EPSILON_MM && pointToSegmentDistanceMm(b.end, a) <= PCB_GEOMETRY_EPSILON_MM
    || Math.abs(o3) <= PCB_GEOMETRY_EPSILON_MM && pointToSegmentDistanceMm(a.start, b) <= PCB_GEOMETRY_EPSILON_MM
    || Math.abs(o4) <= PCB_GEOMETRY_EPSILON_MM && pointToSegmentDistanceMm(a.end, b) <= PCB_GEOMETRY_EPSILON_MM;
}

export function segmentToSegmentDistanceMm(a: PcbSegment, b: PcbSegment): number {
  if (segmentsIntersect(a, b)) return 0;
  return Math.min(pointToSegmentDistanceMm(a.start, b), pointToSegmentDistanceMm(a.end, b), pointToSegmentDistanceMm(b.start, a), pointToSegmentDistanceMm(b.end, a));
}

export function polylineSegments(points: readonly PcbPointMm[]): PcbSegment[] {
  return points.slice(1).map((end, index) => ({ start: points[index], end }));
}

export function rectsOverlap(a: PcbRectMm, b: PcbRectMm, clearanceMm = 0): boolean {
  return a.leftMm < b.rightMm + clearanceMm && a.rightMm + clearanceMm > b.leftMm
    && a.topMm < b.bottomMm + clearanceMm && a.bottomMm + clearanceMm > b.topMm;
}

export function componentCourtyard(component: PcbComponent): PcbRectMm | undefined {
  const footprint = PCB_FOOTPRINTS[component.footprintId];
  if (!footprint) return undefined;
  const swapped = component.rotationDegrees === 90 || component.rotationDegrees === 270;
  const width = (swapped ? footprint.bodySizeMm.heightMm : footprint.bodySizeMm.widthMm) + footprint.courtyardMarginMm * 2;
  const height = (swapped ? footprint.bodySizeMm.widthMm : footprint.bodySizeMm.heightMm) + footprint.courtyardMarginMm * 2;
  return { leftMm: component.positionMm.xMm - width / 2, rightMm: component.positionMm.xMm + width / 2, topMm: component.positionMm.yMm - height / 2, bottomMm: component.positionMm.yMm + height / 2 };
}

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
