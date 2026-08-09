import { describe, expect, it } from 'vitest';
import {
  connectedHoleIds,
  createBreadboardDefinition,
  railHoleId,
  terminalHoleId,
} from '../../src/domain/physical/breadboard';
import { connectionGuideSegment } from '../../src/workbench/scene/connectionGuide';

describe('breadboard connection guide geometry', () => {
  const board = createBreadboardDefinition('main', 30);

  it('draws a vertical guide across a five-hole terminal strip', () => {
    const selected = terminalHoleId(board.id, 'C', 10);
    const segment = connectionGuideSegment(board, new Set(connectedHoleIds(board, selected)));
    expect(segment?.length).toBeCloseTo(10.16, 6);
    expect(Math.abs(segment?.rotationY ?? 0)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('draws a horizontal guide only across the selected split rail section', () => {
    const selected = railHoleId(board.id, 'top', 'positive', 4);
    const segment = connectionGuideSegment(board, new Set(connectedHoleIds(board, selected)));
    expect(segment?.length).toBeCloseTo(14 * board.pitchMm, 6);
    expect(segment?.rotationY).toBeCloseTo(0, 6);
  });
});
