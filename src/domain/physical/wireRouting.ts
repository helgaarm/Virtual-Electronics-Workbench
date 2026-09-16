import { terminalEntries, type JumperWireComponent, type PlacedComponent } from '../components/types';
import { getHole, type BreadboardDefinition } from './breadboard';
import type { Point3Mm } from './geometry';
import { PHYSICAL_PACKAGES } from './packages';

interface Obstacle {
  center: Point3Mm;
  bodyRadiusMm: number;
  radiusMm: number;
  bottomY: number;
  topY: number;
  projection: number;
  halfExtentsMm?: { x: number; z: number };
  // Solid parts need a lateral detour; insulated wires are tidier and remain
  // physically clear when crossed on a higher, straight vertical layer.
  routingMode: 'detour' | 'overpass';
}

interface RoutedWire {
  wire: JumperWireComponent;
  route: Point3Mm[];
}

const WIRE_CLEARANCE_MM = 1.4;
export const MAX_WIRE_RADIUS_MM = 0.58;
export const WIRE_INSERTION_DEPTH_MM = 0.65;
export const WIRE_BOARD_CLEARANCE_MM = 0.08;
const WIRE_LEAD_RADIUS_MM = PHYSICAL_PACKAGES['jumper-wire'].leadDiameterMm / 2;
const WIRE_STRAIGHT_LEAD_HEIGHT_MM = WIRE_LEAD_RADIUS_MM + WIRE_BOARD_CLEARANCE_MM;
const UNDER_BODY_CLEARANCE_MM = 0.04;
const WIRE_TO_WIRE_CLEARANCE_MM = 1.65;
const WIRE_OBSTACLE_SAMPLE_SPACING_MM = 1.5;

function distance2d(left: Point3Mm, right: Point3Mm): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function projectionAlongRoute(
  point: Point3Mm,
  start: Point3Mm,
  end: Point3Mm,
): { projection: number; distanceMm: number } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const closest = {
    x: start.x + dx * projection,
    y: point.y,
    z: start.z + dz * projection,
  };
  return { projection, distanceMm: distance2d(point, closest) };
}

function crossesRectangle(start: Point3Mm, end: Point3Mm, center: Point3Mm, half: { x: number; z: number }): boolean {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'z'] as const) {
    const offset = start[axis] - center[axis];
    const direction = end[axis] - start[axis];
    if (Math.abs(direction) < 1e-9) {
      if (Math.abs(offset) > half[axis]) return false;
    } else {
      const first = (-half[axis] - offset) / direction;
      const last = (half[axis] - offset) / direction;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
      if (enter > leave) return false;
    }
  }
  return true;
}

function insideBody(obstacle: Obstacle, point: Point3Mm): boolean {
  const half = obstacle.halfExtentsMm;
  return half ? Math.abs(point.x - obstacle.center.x) < half.x && Math.abs(point.z - obstacle.center.z) < half.z
    : distance2d(point, obstacle.center) < obstacle.bodyRadiusMm;
}

function bodyEdge(obstacle: Obstacle, direction: { x: number; z: number }, side: number): Point3Mm {
  const half = obstacle.halfExtentsMm;
  const distance = half ? Math.min(
    Math.abs(direction.x) > 1e-9 ? half.x / Math.abs(direction.x) : Infinity,
    Math.abs(direction.z) > 1e-9 ? half.z / Math.abs(direction.z) : Infinity,
  ) : obstacle.bodyRadiusMm;
  return { x: obstacle.center.x + direction.x * distance * side, y: obstacle.center.y,
    z: obstacle.center.z + direction.z * distance * side };
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

  const { projection, distanceMm } = projectionAlongRoute(center, start, end);

  // The Nano's 45 × 18 mm board must not reserve a 48 mm diameter circle:
  // that incorrectly puts the accessible rows beside its headers under its body.
  // Its allowed 0/180-degree orientations have the same axis-aligned footprint.
  if (component.kind === 'arduino-nano') {
    const clearance = MAX_WIRE_RADIUS_MM + WIRE_BOARD_CLEARANCE_MM;
    const halfExtentsMm = { x: packageDefinition.dimensionsMm.x / 2 + clearance, z: packageDefinition.dimensionsMm.z / 2 + clearance };
    return crossesRectangle(start, end, center, halfExtentsMm)
      ? { center, bodyRadiusMm, radiusMm, bottomY, topY, projection, halfExtentsMm, routingMode: 'detour' }
      : undefined;
  }

  return distanceMm < radiusMm
    ? { center, bodyRadiusMm, radiusMm, bottomY, topY, projection, routingMode: 'detour' }
    : undefined;
}

function sampleWireRoute(route: readonly Point3Mm[]): Point3Mm[] {
  return route.slice(0, -1).flatMap((start, segmentIndex) => {
    const end = route[segmentIndex + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    const stepCount = Math.max(1, Math.ceil(length / WIRE_OBSTACLE_SAMPLE_SPACING_MM));
    return Array.from({ length: stepCount }, (_, stepIndex) => {
      const amount = stepIndex / stepCount;
      return {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        z: start.z + (end.z - start.z) * amount,
      };
    });
  });
}

function wireRouteObstacles(
  board: BreadboardDefinition,
  wire: JumperWireComponent,
  routedWires: readonly RoutedWire[],
  start: Point3Mm,
  end: Point3Mm,
): Obstacle[] {
  const currentTerminalIds = new Set(Object.values(wire.terminalHoleIds));
  const obstacles = routedWires.flatMap(({ wire: routedWire, route }) => {
    const sharedHoleIds = Object.values(routedWire.terminalHoleIds)
      .filter((holeId) => currentTerminalIds.has(holeId));
    const sharedPoints = sharedHoleIds
      .map((holeId) => getHole(board, holeId)?.positionMm)
      .filter((point) => point !== undefined);
    return sampleWireRoute(route).flatMap((sample): Obstacle[] => {
      if (sharedPoints.some((point) => distance2d(point, sample) < WIRE_TO_WIRE_CLEARANCE_MM)) {
        return [];
      }
      const { projection, distanceMm } = projectionAlongRoute(sample, start, end);
      if (distanceMm >= WIRE_TO_WIRE_CLEARANCE_MM) return [];
      return [{
        center: sample,
        bodyRadiusMm: WIRE_TO_WIRE_CLEARANCE_MM,
        radiusMm: WIRE_TO_WIRE_CLEARANCE_MM,
        bottomY: sample.y - MAX_WIRE_RADIUS_MM,
        topY: sample.y + MAX_WIRE_RADIUS_MM,
        projection,
        routingMode: 'overpass',
      }];
    });
  }).sort((left, right) => left.projection - right.projection);

  return obstacles.filter((obstacle, index) => {
    const previous = obstacles[index - 1];
    if (!previous || obstacle.projection - previous.projection >= 0.045) return true;
    return obstacle.topY > previous.topY + 0.2;
  });
}

function isInsideBoard(board: BreadboardDefinition, point: Point3Mm): boolean {
  return Math.abs(point.x) <= board.widthMm / 2 - 1
    && Math.abs(point.z) <= board.depthMm / 2 - 1;
}

/**
 * Produces a raised, rounded jumper path. Components crossing the direct route
 * add lateral waypoints and determine the minimum safe height of the wire.
 */
function routeSingleJumperWire(
  board: BreadboardDefinition,
  wire: JumperWireComponent,
  solidComponents: Array<Exclude<PlacedComponent, JumperWireComponent>>,
  routedWires: readonly RoutedWire[],
): Point3Mm[] {
  const startHole = getHole(board, wire.terminalHoleIds.a);
  const endHole = getHole(board, wire.terminalHoleIds.b);
  if (!startHole || !endHole) return [];

  const startInsertion = {
    ...startHole.positionMm,
    y: startHole.positionMm.y - WIRE_INSERTION_DEPTH_MM,
  };
  const endInsertion = {
    ...endHole.positionMm,
    y: endHole.positionMm.y - WIRE_INSERTION_DEPTH_MM,
  };
  const start = {
    ...startHole.positionMm,
    y: startHole.positionMm.y + WIRE_STRAIGHT_LEAD_HEIGHT_MM,
  };
  const end = {
    ...endHole.positionMm,
    y: endHole.positionMm.y + WIRE_STRAIGHT_LEAD_HEIGHT_MM,
  };
  const directDistance = distance2d(start, end);
  const rise = Math.min(14, 5 + directDistance * 0.16);
  const defaultPeakY = Math.max(start.y, end.y) + rise + 1;
  const obstacles = [
    ...solidComponents
    .map((component) => componentObstacle(board, component, start, end))
    .filter((obstacle) => obstacle !== undefined),
    ...wireRouteObstacles(board, wire, routedWires, start, end),
  ]
    .sort((left, right) => left.projection - right.projection);

  if (obstacles.length === 0 || directDistance < 0.001) {
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: defaultPeakY,
      z: (start.z + end.z) / 2,
    };
    return [
      startInsertion,
      start,
      { ...start, y: defaultPeakY - 1 },
      midpoint,
      { ...end, y: defaultPeakY - 1 },
      end,
      endInsertion,
    ];
  }

  const directionX = (end.x - start.x) / directDistance;
  const directionZ = (end.z - start.z) / directDistance;
  const perpendicular = { x: -directionZ, z: directionX };
  const peakY = Math.max(defaultPeakY, ...obstacles.map((obstacle) => obstacle.topY + 1.2
    + (obstacle.routingMode === 'overpass' ? MAX_WIRE_RADIUS_MM : 0)));

  const detourObstacles = obstacles.filter((obstacle) => obstacle.routingMode === 'detour');
  const sideScore = (side: -1 | 1) => detourObstacles.reduce((score, obstacle) => {
    const candidate = {
      ...bodyEdge(obstacle, perpendicular, side),
      y: peakY,
    };
    const boundaryPenalty = isInsideBoard(board, candidate) ? 0 : 10_000;
    const crowdingPenalty = detourObstacles.reduce((penalty, other) => {
      if (other === obstacle) return penalty;
      const overlap = other.bodyRadiusMm - distance2d(candidate, other.center);
      return penalty + Math.max(0, overlap) * 100;
    }, 0);
    return score + boundaryPenalty + crowdingPenalty
      + distance2d(start, candidate) + distance2d(candidate, end);
  }, 0);
  const side: -1 | 1 = sideScore(-1) <= sideScore(1) ? -1 : 1;
  const startObstacles = detourObstacles.filter(
    (obstacle) => insideBody(obstacle, start),
  );
  const endObstacles = detourObstacles.filter(
    (obstacle) => insideBody(obstacle, end),
  );
  const endpointObstacles = new Set([...startObstacles, ...endObstacles]);
  const detours = detourObstacles
    .filter((obstacle) => !endpointObstacles.has(obstacle))
    .map((obstacle) => ({
      ...bodyEdge(obstacle, perpendicular, side),
      y: peakY,
    }));

  // Keep short vertical stripped tips. Route fully insulated under raised
  // packages when it fits; only genuinely low packages need a bare escape.
  const insulationFloorY = startHole.positionMm.y + MAX_WIRE_RADIUS_MM + WIRE_BOARD_CLEARANCE_MM;
  const raiseInsulatedTip = (endpoint: Point3Mm, blockers: Obstacle[]) => {
    if (blockers.length && blockers.every((obstacle) => obstacle.bottomY > insulationFloorY + MAX_WIRE_RADIUS_MM + UNDER_BODY_CLEARANCE_MM)) {
      endpoint.y = insulationFloorY;
    }
  };
  raiseInsulatedTip(start, startObstacles);
  raiseInsulatedTip(end, endObstacles);
  const escapePoint = (obstacle: Obstacle, endpoint: Point3Mm) => {
    const radius = endpoint.y >= insulationFloorY ? MAX_WIRE_RADIUS_MM : WIRE_LEAD_RADIUS_MM;
    return {
      ...bodyEdge(obstacle, perpendicular, side),
      y: obstacle.bottomY - radius - UNDER_BODY_CLEARANCE_MM > endpoint.y
        ? Math.min(
          endpoint.y + 0.25,
          obstacle.bottomY - radius - UNDER_BODY_CLEARANCE_MM,
        )
        : obstacle.topY + 1.2,
    };
  };
  const startEscapes = startObstacles.map((obstacle) => escapePoint(obstacle, start));
  const endEscapes = endObstacles.map((obstacle) => escapePoint(obstacle, end));
  const raisedStart = startEscapes.at(-1) ?? start;
  const raisedEnd = endEscapes[0] ?? end;

  return [
    startInsertion,
    start,
    ...startEscapes,
    { ...raisedStart, y: peakY - 0.8 },
    ...detours,
    { ...raisedEnd, y: peakY - 0.8 },
    ...endEscapes.reverse(),
    end,
    endInsertion,
  ];
}

/** Routes jumpers in stable component order so later wires avoid the already
 * established insulated paths without introducing circular route decisions. */
export function routeJumperWires(
  board: BreadboardDefinition,
  components: PlacedComponent[],
): Map<string, Point3Mm[]> {
  const solidComponents = components.filter(
    (component): component is Exclude<PlacedComponent, JumperWireComponent> => component.kind !== 'jumper-wire',
  );
  const routedWires: RoutedWire[] = [];
  const routes = new Map<string, Point3Mm[]>();
  for (const component of components) {
    if (component.kind !== 'jumper-wire') continue;
    const route = routeSingleJumperWire(board, component, solidComponents, routedWires);
    routedWires.push({ wire: component, route });
    routes.set(component.id, route);
  }
  return routes;
}

export function routeJumperWire(
  board: BreadboardDefinition,
  wire: JumperWireComponent,
  components: PlacedComponent[],
): Point3Mm[] {
  return routeJumperWires(
    board,
    components.some((component) => component.id === wire.id) ? components : [...components, wire],
  ).get(wire.id) ?? [];
}
