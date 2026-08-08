import * as THREE from 'three';

export function createSmoothTubeGeometry(
  points: THREE.Vector3[],
  radius: number,
  tubularSegments = 40,
): THREE.TubeGeometry {
  const curve: THREE.Curve<THREE.Vector3> = points.length === 2
    ? new THREE.LineCurve3(points[0], points[1])
    : new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(
    curve,
    Math.max(tubularSegments, points.length * 12),
    radius,
    16,
    false,
  );
}
