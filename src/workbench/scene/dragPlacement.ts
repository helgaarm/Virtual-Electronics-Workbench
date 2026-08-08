import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { Point3Mm } from '../../domain/physical/geometry';

export function dragCandidateHoleId(
  board: BreadboardDefinition,
  pointer: Point3Mm,
  anchorOffset?: Point3Mm,
): string | undefined {
  const candidateX = pointer.x - (anchorOffset?.x ?? 0);
  const candidateZ = pointer.z - (anchorOffset?.z ?? 0);
  const nearest = board.holes
    .map((hole) => ({
      hole,
      distance: Math.hypot(hole.positionMm.x - candidateX, hole.positionMm.z - candidateZ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= board.pitchMm * 0.8 ? nearest.hole.id : undefined;
}
