import { BREADBOARD_PITCH_MM, type Point3Mm } from './geometry';

export const TERMINAL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type TerminalRow = (typeof TERMINAL_ROWS)[number];

export type HoleKind = 'terminal' | 'rail-positive' | 'rail-negative';

export interface BreadboardHole {
  id: string;
  label: string;
  row: TerminalRow | 'rail';
  column: number;
  positionMm: Point3Mm;
  stripId: string;
  kind: HoleKind;
}

export interface BreadboardDefinition {
  id: string;
  columns: number;
  pitchMm: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  holes: BreadboardHole[];
}

const ROW_Z_MM: Record<TerminalRow, number> = {
  A: -13.97,
  B: -11.43,
  C: -8.89,
  D: -6.35,
  E: -3.81,
  F: 3.81,
  G: 6.35,
  H: 8.89,
  I: 11.43,
  J: 13.97,
};

const RAILS = [
  { side: 'top', polarity: 'positive', z: -24.13 },
  { side: 'top', polarity: 'negative', z: -20.32 },
  { side: 'bottom', polarity: 'negative', z: 20.32 },
  { side: 'bottom', polarity: 'positive', z: 24.13 },
] as const;

function holeId(boardId: string, suffix: string): string {
  return `${boardId}:${suffix}`;
}

export function terminalHoleId(boardId: string, row: TerminalRow, column: number): string {
  return holeId(boardId, `${row}${column}`);
}

export function railHoleId(
  boardId: string,
  side: 'top' | 'bottom',
  polarity: 'positive' | 'negative',
  column: number,
): string {
  return holeId(boardId, `rail:${side}:${polarity}:${column}`);
}

export function createBreadboardDefinition(id = 'main', columns = 30): BreadboardDefinition {
  if (columns < 10) {
    throw new Error('A breadboard requires at least 10 columns.');
  }

  const xForColumn = (column: number) => (column - (columns + 1) / 2) * BREADBOARD_PITCH_MM;
  const holes: BreadboardHole[] = [];

  for (let column = 1; column <= columns; column += 1) {
    for (const row of TERMINAL_ROWS) {
      const bank = row <= 'E' ? 'upper' : 'lower';
      holes.push({
        id: terminalHoleId(id, row, column),
        label: `${row}${column}`,
        row,
        column,
        positionMm: { x: xForColumn(column), y: 3.2, z: ROW_Z_MM[row] },
        stripId: `${id}:strip:${bank}:${column}`,
        kind: 'terminal',
      });
    }

    for (const rail of RAILS) {
      const section = Math.floor((column - 1) / 15);
      const symbol = rail.polarity === 'positive' ? '+' : '-';
      holes.push({
        id: railHoleId(id, rail.side, rail.polarity, column),
        label: `${rail.side === 'top' ? 'T' : 'B'}${symbol}${column}`,
        row: 'rail',
        column,
        positionMm: { x: xForColumn(column), y: 3.2, z: rail.z },
        stripId: `${id}:rail:${rail.side}:${rail.polarity}:${section}`,
        kind: rail.polarity === 'positive' ? 'rail-positive' : 'rail-negative',
      });
    }
  }

  return {
    id,
    columns,
    pitchMm: BREADBOARD_PITCH_MM,
    widthMm: columns * BREADBOARD_PITCH_MM + 8,
    depthMm: 58,
    heightMm: 6.4,
    holes,
  };
}

export function getHole(board: BreadboardDefinition, id: string): BreadboardHole | undefined {
  return board.holes.find((hole) => hole.id === id);
}

export function connectedHoleIds(board: BreadboardDefinition, holeIdValue: string): string[] {
  const selected = getHole(board, holeIdValue);
  if (!selected) return [];
  return board.holes.filter((hole) => hole.stripId === selected.stripId).map((hole) => hole.id);
}
