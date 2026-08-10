import type { PlacedComponent } from '../components/types';
import { terminalEntries } from '../components/types';
import type { BreadboardDefinition } from './breadboard';
import { leadSpanViolation, PHYSICAL_PACKAGES } from './packages';

export interface OccupancyIssue {
  code: 'UNKNOWN_HOLE' | 'HOLE_OCCUPIED' | 'DUPLICATE_TERMINAL' | 'LEAD_SPAN_OUT_OF_RANGE' | 'INVALID_PACKAGE_PLACEMENT' | 'PACKAGE_OVERLAP';
  message: string;
  componentId: string;
  holeId: string;
}

interface PackageFootprint {
  component: PlacedComponent;
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
}

function packageFootprint(
  board: BreadboardDefinition,
  component: PlacedComponent,
): PackageFootprint | undefined {
  // Jumper wires are deliberately routed around packages and do not have a
  // board-level solid body to reserve.
  if (component.kind === 'jumper-wire') return undefined;
  const holes = terminalEntries(component)
    .map(([, holeId]) => board.holes.find((hole) => hole.id === holeId))
    .filter((hole) => hole !== undefined);
  if (holes.length === 0) return undefined;
  const centerX = holes.reduce((sum, hole) => sum + hole.positionMm.x, 0) / holes.length;
  const centerZ = holes.reduce((sum, hole) => sum + hole.positionMm.z, 0) / holes.length;
  const dimensions = PHYSICAL_PACKAGES[component.kind].dimensionsMm;
  const first = holes[0];
  const second = holes[1];
  const axisRunsAlongZ = Boolean(first && second
    && Math.abs(second.positionMm.z - first.positionMm.z) > Math.abs(second.positionMm.x - first.positionMm.x));
  return {
    component,
    centerX,
    centerZ,
    halfX: (axisRunsAlongZ ? dimensions.z : dimensions.x) / 2,
    halfZ: (axisRunsAlongZ ? dimensions.x : dimensions.z) / 2,
  };
}

export function buildOccupancy(components: PlacedComponent[]): Map<string, string> {
  const occupancy = new Map<string, string>();
  for (const component of components) {
    for (const [, holeId] of terminalEntries(component)) {
      occupancy.set(holeId, component.id);
    }
  }
  return occupancy;
}

export function validateOccupancy(
  board: BreadboardDefinition,
  components: PlacedComponent[],
): OccupancyIssue[] {
  const validHoles = new Set(board.holes.map((hole) => hole.id));
  const occupied = new Map<string, string>();
  const issues: OccupancyIssue[] = [];

  for (const component of components) {
    const local = new Set<string>();
    for (const [, holeId] of terminalEntries(component)) {
      if (!validHoles.has(holeId)) {
        issues.push({
          code: 'UNKNOWN_HOLE',
          message: `${component.label} targets a hole that is not on this board.`,
          componentId: component.id,
          holeId,
        });
      } else if (local.has(holeId)) {
        issues.push({
          code: 'DUPLICATE_TERMINAL',
          message: `${component.label} has two terminals in ${holeId}.`,
          componentId: component.id,
          holeId,
        });
      } else if (occupied.has(holeId)) {
        issues.push({
          code: 'HOLE_OCCUPIED',
          message: `${holeId} is already occupied by ${occupied.get(holeId)}.`,
          componentId: component.id,
          holeId,
        });
      }
      local.add(holeId);
      occupied.set(holeId, component.id);
    }
    const terminals = terminalEntries(component);
    if (component.kind === 'ne555') {
      const pinHoles = terminals
        .map(([, holeId]) => board.holes.find((hole) => hole.id === holeId))
        .filter((hole) => hole !== undefined);
      const columns = [...new Set(pinHoles.map((hole) => hole.column))].sort((left, right) => left - right);
      const validRows = pinHoles.filter((hole) => hole.row === 'E').length === 4
        && pinHoles.filter((hole) => hole.row === 'F').length === 4;
      const consecutiveColumns = columns.length === 4
        && columns.every((column, index) => index === 0 || column === columns[index - 1] + 1);
      const twoPinsPerColumn = columns.every(
        (column) => pinHoles.filter((hole) => hole.column === column).length === 2,
      );
      const minimumColumn = columns[0];
      const maximumColumn = columns[columns.length - 1];
      const expectedPinPositions = component.rotation === 0
        ? [
          ['E', minimumColumn], ['E', minimumColumn + 1],
          ['E', minimumColumn + 2], ['E', maximumColumn],
          ['F', maximumColumn], ['F', minimumColumn + 2],
          ['F', minimumColumn + 1], ['F', minimumColumn],
        ] as const
        : component.rotation === 180
          ? [
            ['F', maximumColumn], ['F', minimumColumn + 2],
            ['F', minimumColumn + 1], ['F', minimumColumn],
            ['E', minimumColumn], ['E', minimumColumn + 1],
            ['E', minimumColumn + 2], ['E', maximumColumn],
          ] as const
          : [];
      const correctPinOrder = expectedPinPositions.length === 8
        && expectedPinPositions.every(([row, column], pinIndex) => {
          const hole = board.holes.find(
            (candidate) => candidate.id === component.terminalHoleIds[`pin${pinIndex + 1}` as keyof typeof component.terminalHoleIds],
          );
          return hole?.row === row && hole.column === column;
        });
      if (!validRows || !consecutiveColumns || !twoPinsPerColumn || !correctPinOrder) {
        issues.push({
          code: 'INVALID_PACKAGE_PLACEMENT',
          message: `${component.label} must straddle the centre channel with rigid DIP-8 pin order.`,
          componentId: component.id,
          holeId: terminals[0]?.[1] ?? '',
        });
      }
    }
    const limits = PHYSICAL_PACKAGES[component.kind].leadSpanMm;
    if (limits && terminals.length >= 2) {
      const first = board.holes.find((hole) => hole.id === terminals[0][1]);
      const second = board.holes.find((hole) => hole.id === terminals[1][1]);
      const span = first && second
        ? Math.hypot(
          second.positionMm.x - first.positionMm.x,
          second.positionMm.z - first.positionMm.z,
        )
        : undefined;
      const violation = span === undefined ? undefined : leadSpanViolation(component.kind, span);
      if (violation) {
        issues.push({
          code: 'LEAD_SPAN_OUT_OF_RANGE',
          message: violation === 'too-short'
            ? `${component.label} needs at least ${limits.minimum} mm between its leads.`
            : `${component.label} allows at most ${limits.maximum} mm between its leads.`,
          componentId: component.id,
          holeId: terminals[1][1],
        });
      }
    }
  }


  return issues;
}

/** Checks the board-space footprints of solid packages without affecting circuit extraction. */
export function validatePackageOverlaps(
  board: BreadboardDefinition,
  components: PlacedComponent[],
): OccupancyIssue[] {
  const issues: OccupancyIssue[] = [];
  const footprints = components
    .map((component) => packageFootprint(board, component))
    .filter((footprint) => footprint !== undefined);
  for (let index = 0; index < footprints.length; index += 1) {
    const current = footprints[index];
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const other = footprints[otherIndex];
      const overlapsX = Math.abs(current.centerX - other.centerX) < current.halfX + other.halfX;
      const overlapsZ = Math.abs(current.centerZ - other.centerZ) < current.halfZ + other.halfZ;
      if (!overlapsX || !overlapsZ) continue;
      issues.push({
        code: 'PACKAGE_OVERLAP',
        message: `${current.component.label} overlaps ${other.component.label}. Choose a placement with room for both packages.`,
        componentId: current.component.id,
        holeId: terminalEntries(current.component)[0]?.[1] ?? '',
      });
    }
  }

  return issues;
}
