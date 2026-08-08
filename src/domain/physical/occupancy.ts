import type { PlacedComponent } from '../components/types';
import { terminalEntries } from '../components/types';
import type { BreadboardDefinition } from './breadboard';

export interface OccupancyIssue {
  code: 'UNKNOWN_HOLE' | 'HOLE_OCCUPIED' | 'DUPLICATE_TERMINAL';
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
  }

  return issues;
}
