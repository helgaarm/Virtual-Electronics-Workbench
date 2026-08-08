import { terminalEntries, type JumperWireComponent, type PlacedComponent } from '../components/types';
import { getHole, type BreadboardDefinition } from './breadboard';
import type { Point3Mm } from './geometry';
import { PHYSICAL_PACKAGES } from './packages';

interface Obstacle {
  center: Point3Mm;
  radiusMm: number;
  bottomY: number;
  topY: number;
  projection: number;
}

const WIRE_CLEARANCE_MM = 1.4;
const MAX_WIRE_RADIUS_MM = 0.6;

function distance2d(left: Point3Mm, right: Point3Mm): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function componentObstacle(
  board: BreadboardDefinition,
  component: Exclude<PlacedComponent, JumperWireComponent>,
  start: Point3Mm,
  end: Point3Mm,
): Obstacle | undefined {
  const holes = terminalEntries(component)
    .map(([, holeId]) => getHole(board, holeId))
    .filter((hole) => hole !== undefined);
  if (holes.length === 0) return undefined;

  const center = holes.reduce<Point3Mm>(
    (total, hole) => ({
      x: total.x + hole.positionMm.x / holes.length,
      y: total.y + hole.positionMm.y / holes.length,
      z: total.z + hole.positionMm.z / holes.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const packageDefinition = PHYSICAL_PACKAGES[component.kind];
  const bodyRadiusMm = Math.max(packageDefinition.dimensionsMm.x, packageDefinition.dimensionsMm.z) / 2
    + WIRE_CLEARANCE_MM;
  const terminalReachMm = Math.max(
    0,
    ...holes.map((hole) => distance2d(center, hole.positionMm)),
  );
  const leadEnvelopeRadiusMm = terminalReachMm
    + packageDefinition.leadDiameterMm / 2
    + WIRE_CLEARANCE_MM;
  const radiusMm = Math.max(bodyRadiusMm, leadEnvelopeRadiusMm);
  const topY = center.y + packageDefinition.mountingHeightMm
    + packageDefinition.dimensionsMm.y / 2 + WIRE_CLEARANCE_MM;
  const bottomY = center.y + packageDefinition.mountingHeightMm
    - packageDefinition.dimensionsMm.y / 2;

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((center.x - start.x) * dx + (center.z - start.z) * dz) / lengthSquared));
  const closest = {
    x: start.x + dx * projection,
    y: center.y,
    z: start.z + dz * projection,
  };

  return distance2d(center, closest) < radiusMm
    ? { center, radiusMm, bottomY, topY, projection }
    : undefined;
}

function isInsideBoard(board: BreadboardDefinition, point: Point3Mm): boolean {
  return Math.abs(point.x) <= board.widthMm / 2 - 1
    && Math.abs(point.z) <= board.depthMm / 2 - 1;
}

/**
 * Produces a raised, rounded jumper path. Components crossing the direct route
 * add lateral waypoints and determine the minimum safe height of the wire.
 */
export function routeJumperWire(
  board: BreadboardDefinition,
  wire: JumperWireComponent,
  components: PlacedComponent[],
): Point3Mm[] {
  const startHole = getHole(board, wire.terminalHoleIds.a);
  const endHole = getHole(board, wire.terminalHoleIds.b);
  if (!startHole || !endHole) return [];

  const start = { ...startHole.positionMm, y: startHole.positionMm.y + 0.2 };
  const end = { ...endHole.positionMm, y: endHole.positionMm.y + 0.2 };
  const directDistance = distance2d(start, end);
  const rise = Math.min(14, 5 + directDistance * 0.16);
  const defaultPeakY = Math.max(start.y, end.y) + rise + 1;
  const obstacles = components
    .filter((component): component is Exclude<PlacedComponent, JumperWireComponent> => component.kind !== 'jumper-wire')
    .map((component) => componentObstacle(board, component, start, end))
    .filter((obstacle) => obstacle !== undefined)
    .sort((left, right) => left.projection - right.projection);

  if (obstacles.length === 0 || directDistance < 0.001) {
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: defaultPeakY,
      z: (start.z + end.z) / 2,
    };
    return [
      start,
      { ...start, y: defaultPeakY - 1 },
      midpoint,
      { ...end, y: defaultPeakY - 1 },
      end,
    ];
  }

  const directionX = (end.x - start.x) / directDistance;
  const directionZ = (end.z - start.z) / directDistance;
  const perpendicular = { x: -directionZ, z: directionX };
  const peakY = Math.max(defaultPeakY, ...obstacles.map((obstacle) => obstacle.topY + 1.2));

  const sideScore = (side: -1 | 1) => obstacles.reduce((score, obstacle) => {
    const candidate = {
      x: obstacle.center.x + perpendicular.x * obstacle.radiusMm * side,
      y: peakY,
      z: obstacle.center.z + perpendicular.z * obstacle.radiusMm * side,
    };
    const boundaryPenalty = isInsideBoard(board, candidate) ? 0 : 10_000;
    const crowdingPenalty = obstacles.reduce((penalty, other) => {
      if (other === obstacle) return penalty;
      const overlap = other.radiusMm - distance2d(candidate, other.center);
      return penalty + Math.max(0, overlap) * 100;
    }, 0);
    return score + boundaryPenalty + crowdingPenalty
      + distance2d(start, candidate) + distance2d(candidate, end);
  }, 0);
  const side: -1 | 1 = sideScore(-1) <= sideScore(1) ? -1 : 1;
  const detours = obstacles.map((obstacle) => ({
    x: obstacle.center.x + perpendicular.x * obstacle.radiusMm * side,
    y: peakY,
    z: obstacle.center.z + perpendicular.z * obstacle.radiusMm * side,
  }));
  const startObstacles = obstacles.filter((obstacle) => distance2d(start, obstacle.center) < obstacle.radiusMm);
  const endObstacles = obstacles.filter((obstacle) => distance2d(end, obstacle.center) < obstacle.radiusMm);
  const escapePoint = (obstacle: Obstacle, endpoint: Point3Mm) => ({
    x: obstacle.center.x + perpendicular.x * obstacle.radiusMm * side,
    y: obstacle.bottomY - MAX_WIRE_RADIUS_MM - 0.2 > endpoint.y
      ? Math.min(endpoint.y + 0.25, obstacle.bottomY - MAX_WIRE_RADIUS_MM - 0.2)
      : obstacle.topY + 1.2,
    z: obstacle.center.z + perpendicular.z * obstacle.radiusMm * side,
  });
  const startEscapes = startObstacles.map((obstacle) => escapePoint(obstacle, start));
  const endEscapes = endObstacles.map((obstacle) => escapePoint(obstacle, end));
  const raisedStart = startEscapes.at(-1) ?? start;
  const raisedEnd = endEscapes[0] ?? end;

  return [
    start,
    ...startEscapes,
    { ...raisedStart, y: peakY - 0.8 },
    ...detours,
    { ...raisedEnd, y: peakY - 0.8 },
    ...endEscapes.reverse(),
    end,
  ];
}
