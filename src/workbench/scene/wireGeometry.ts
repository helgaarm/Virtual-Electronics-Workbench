import * as THREE from 'three';
import type { Point3Mm } from '../../domain/physical/geometry';

export function createJumperCurve(points: Point3Mm[]): THREE.CatmullRomCurve3 | undefined {
  if (points.length < 2) return undefined;
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    false,
    'centripetal',
  );
}
