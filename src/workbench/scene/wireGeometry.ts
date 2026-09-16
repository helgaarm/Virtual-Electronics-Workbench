import * as THREE from 'three';
import type { Point3Mm } from '../../domain/physical/geometry';
import { PHYSICAL_PACKAGES } from '../../domain/physical/packages';
import { MAX_WIRE_RADIUS_MM, WIRE_BOARD_CLEARANCE_MM, WIRE_INSERTION_DEPTH_MM } from '../../domain/physical/wireRouting';

const CORNER_TRIM_MM = 2;
type WireSegment = THREE.LineCurve3 | THREE.QuadraticBezierCurve3;

/** Round each bend locally: Bezier control points stay inside the routed
 * corner, so smoothing cannot overshoot below the board or curl past a hole. */
export function createJumperCurve(points: readonly Point3Mm[]): THREE.CurvePath<THREE.Vector3> | undefined {
  if (points.length < 2) return undefined;
  const vertices = points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const curve = new THREE.CurvePath<THREE.Vector3>();
  let previous = vertices[0];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const corner = vertices[index];
    const incoming = corner.distanceTo(vertices[index - 1]);
    const outgoing = corner.distanceTo(vertices[index + 1]);
    // Keep the insertion segments exactly vertical. All rounding starts above
    // the board, including the full radius of the exposed conductor.
    const trim = index === 1 || index === vertices.length - 2
      ? 0 : Math.min(CORNER_TRIM_MM, incoming / 2, outgoing / 2);
    const entry = corner.clone().lerp(vertices[index - 1], incoming > 0 ? trim / incoming : 0);
    const exit = corner.clone().lerp(vertices[index + 1], outgoing > 0 ? trim / outgoing : 0);
    if (previous.distanceToSquared(entry) > 1e-12) curve.add(new THREE.LineCurve3(previous, entry));
    if (trim > 0) curve.add(new THREE.QuadraticBezierCurve3(entry, corner, exit));
    previous = exit;
  }
  if (previous.distanceToSquared(vertices.at(-1)!) > 1e-12) {
    curve.add(new THREE.LineCurve3(previous, vertices.at(-1)!));
  }
  return curve.curves.length ? curve : undefined;
}

function heightCrossings(segment: WireSegment, heightMm: number): number[] {
  const startY = segment.getPoint(0).y;
  const endY = segment.getPoint(1).y;
  const a = segment instanceof THREE.QuadraticBezierCurve3 ? startY - 2 * segment.v1.y + endY : 0;
  const b = segment instanceof THREE.QuadraticBezierCurve3 ? 2 * (segment.v1.y - startY) : endY - startY;
  const c = startY - heightMm;
  const discriminant = b * b - 4 * a * c;
  const roots = Math.abs(a) < 1e-12
    ? (Math.abs(b) < 1e-12 ? [] : [-c / b])
    : discriminant < 0 ? [] : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
  return roots.filter((root) => root > 0 && root < 1).sort((left, right) => left - right);
}

function segmentSection(segment: WireSegment, start: number, end: number): WireSegment {
  const from = segment.getPoint(start);
  const to = segment.getPoint(end);
  if (segment instanceof THREE.LineCurve3) return new THREE.LineCurve3(from, to);
  const halfDerivative = segment.v1.clone().sub(segment.v0).multiplyScalar(1 - start)
    .addScaledVector(segment.v2.clone().sub(segment.v1), start);
  return new THREE.QuadraticBezierCurve3(from, from.clone().addScaledVector(halfDerivative, end - start), to);
}

/** Split at exact height crossings so every insulated section clears the board,
 * including when selection makes the insulation slightly thicker. */
export function createJumperCurves(points: readonly Point3Mm[]) {
  const conductor = createJumperCurve(points);
  if (!conductor) return undefined;
  const surfaceY = Math.max(points[0].y, points.at(-1)!.y) + WIRE_INSERTION_DEPTH_MM;
  const insulationFloorY = surfaceY + MAX_WIRE_RADIUS_MM + WIRE_BOARD_CLEARANCE_MM;
  const insulation: THREE.CurvePath<THREE.Vector3>[] = [];
  let active: THREE.CurvePath<THREE.Vector3> | undefined;
  for (const curve of conductor.curves) {
    if (!(curve instanceof THREE.LineCurve3 || curve instanceof THREE.QuadraticBezierCurve3)) continue;
    const boundaries = [0, ...heightCrossings(curve, insulationFloorY), 1];
    for (let index = 1; index < boundaries.length; index += 1) {
      const start = boundaries[index - 1];
      const end = boundaries[index];
      if (curve.getPoint((start + end) / 2).y < insulationFloorY) {
        active = undefined;
      } else if (end - start > 1e-12) {
        if (!active) {
          active = new THREE.CurvePath<THREE.Vector3>();
          insulation.push(active);
        }
        active.add(segmentSection(curve, start, end));
      }
    }
  }
  return { conductor, insulation };
}

export function createJumperGeometry(points: readonly Point3Mm[], selected: boolean) {
  const curves = createJumperCurves(points);
  if (!curves) return undefined;
  const segments = Math.max(72, points.length * 18);
  return {
    conductor: new THREE.TubeGeometry(curves.conductor, segments, PHYSICAL_PACKAGES['jumper-wire'].leadDiameterMm / 2, 16, false),
    insulation: curves.insulation.map((curve) => new THREE.TubeGeometry(curve, segments, selected ? MAX_WIRE_RADIUS_MM : 0.48, 16, false)),
  };
}
