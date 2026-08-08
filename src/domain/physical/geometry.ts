export const BREADBOARD_PITCH_MM = 2.54;

export interface Point3Mm {
  x: number;
  y: number;
  z: number;
}

export type QuarterTurn = 0 | 90 | 180 | 270;

export function rotatePoint(point: Point3Mm, rotation: QuarterTurn): Point3Mm {
  const { x, y, z } = point;
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: -z, y, z: x };
    case 180:
      return { x: -x, y, z: -z };
    case 270:
      return { x: z, y, z: -x };
  }
}

export function nextQuarterTurn(rotation: QuarterTurn): QuarterTurn {
  return ((rotation + 90) % 360) as QuarterTurn;
}
