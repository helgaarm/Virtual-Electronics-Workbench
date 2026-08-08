import { describe, expect, it } from 'vitest';
import { createBreadboardDefinition, terminalHoleId } from '../../src/domain/physical/breadboard';
import { dragCandidateHoleId } from '../../src/workbench/scene/dragPlacement';

describe('drag placement', () => {
  it('preserves the pointer-to-first-lead grab offset', () => {
    const board = createBreadboardDefinition();
    const originalAnchor = board.holes.find((hole) => hole.id === terminalHoleId(board.id, 'E', 5))!;
    const destination = board.holes.find((hole) => hole.id === terminalHoleId(board.id, 'E', 12))!;
    const grabOffset = { x: board.pitchMm * 2.5, y: 0, z: 0 };
    const pointer = {
      x: destination.positionMm.x + grabOffset.x,
      y: destination.positionMm.y,
      z: destination.positionMm.z,
    };

    expect(originalAnchor.positionMm.x + grabOffset.x).not.toBeCloseTo(originalAnchor.positionMm.x);
    expect(dragCandidateHoleId(board, pointer, grabOffset)).toBe(destination.id);
    expect(dragCandidateHoleId(board, pointer)).not.toBe(destination.id);
  });
});
