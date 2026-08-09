import type { BreadboardDefinition, BreadboardHole, TerminalRow } from '../domain/physical/breadboard';
import { TERMINAL_ROWS } from '../domain/physical/breadboard';

export interface BreadboardHoleOptionGroup {
  label: string;
  holes: BreadboardHole[];
}

const RAIL_GROUPS = [
  { prefix: 'T+', label: 'Top positive rail (+)' },
  { prefix: 'T-', label: 'Top negative rail (−)' },
  { prefix: 'B-', label: 'Bottom negative rail (−)' },
  { prefix: 'B+', label: 'Bottom positive rail (+)' },
] as const;

function holesForRow(board: BreadboardDefinition, row: TerminalRow): BreadboardHole[] {
  return board.holes
    .filter((hole) => hole.row === row)
    .sort((left, right) => left.column - right.column);
}

export function breadboardHoleOptionGroups(board: BreadboardDefinition): BreadboardHoleOptionGroup[] {
  const rails = RAIL_GROUPS.slice(0, 2).map(({ prefix, label }) => ({
    label,
    holes: board.holes
      .filter((hole) => hole.label.startsWith(prefix))
      .sort((left, right) => left.column - right.column),
  }));
  const terminalRows = TERMINAL_ROWS.map((row) => ({
    label: `Terminal row ${row}`,
    holes: holesForRow(board, row),
  }));
  const bottomRails = RAIL_GROUPS.slice(2).map(({ prefix, label }) => ({
    label,
    holes: board.holes
      .filter((hole) => hole.label.startsWith(prefix))
      .sort((left, right) => left.column - right.column),
  }));
  return [...rails, ...terminalRows, ...bottomRails].filter((group) => group.holes.length > 0);
}
