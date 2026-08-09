import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import { getHole } from '../domain/physical/breadboard';

export function connectionLearningTarget(
  board: BreadboardDefinition,
  selectedHoleId: string | undefined,
  selectedComponent: PlacedComponent | undefined,
): string | undefined {
  if (selectedHoleId && getHole(board, selectedHoleId)) return selectedHoleId;
  const componentHoleId = selectedComponent ? terminalEntries(selectedComponent)[0]?.[1] : undefined;
  if (componentHoleId && getHole(board, componentHoleId)) return componentHoleId;
  const middleColumn = Math.ceil(board.columns / 2);
  return board.holes.find((hole) => hole.row === 'E' && hole.column === middleColumn)?.id
    ?? board.holes[0]?.id;
}
