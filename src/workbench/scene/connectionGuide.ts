import type { BreadboardDefinition } from '../../domain/physical/breadboard';

export interface ConnectionGuideSegment {
  centerX: number;
  centerZ: number;
  length: number;
  rotationY: number;
}

export function connectionGuideSegment(
  board: BreadboardDefinition,
  holeIds: ReadonlySet<string>,
): ConnectionGuideSegment | undefined {
  const holes = board.holes.filter((hole) => holeIds.has(hole.id));
  if (holes.length < 2) return undefined;
  const xSpan = Math.max(...holes.map((hole) => hole.positionMm.x))
    - Math.min(...holes.map((hole) => hole.positionMm.x));
  const zSpan = Math.max(...holes.map((hole) => hole.positionMm.z))
    - Math.min(...holes.map((hole) => hole.positionMm.z));
  const sorted = [...holes].sort((left, right) => xSpan >= zSpan
    ? left.positionMm.x - right.positionMm.x
    : left.positionMm.z - right.positionMm.z);
  const first = sorted[0].positionMm;
  const last = sorted.at(-1)?.positionMm;
  if (!last) return undefined;
  const deltaX = last.x - first.x;
  const deltaZ = last.z - first.z;
  return {
    centerX: (first.x + last.x) / 2,
    centerZ: (first.z + last.z) / 2,
    length: Math.hypot(deltaX, deltaZ),
    rotationY: -Math.atan2(deltaZ, deltaX),
  };
}
