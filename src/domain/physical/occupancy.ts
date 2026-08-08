import type { PlacedComponent } from '../components/types';
import { terminalEntries } from '../components/types';
import type { BreadboardDefinition } from './breadboard';
import { leadSpanViolation, PHYSICAL_PACKAGES } from './packages';

export interface OccupancyIssue {
  code: 'UNKNOWN_HOLE' | 'HOLE_OCCUPIED' | 'DUPLICATE_TERMINAL' | 'LEAD_SPAN_OUT_OF_RANGE';
  message: string;
  componentId: string;
  holeId: string;
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
