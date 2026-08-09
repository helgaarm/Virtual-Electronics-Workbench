import { describe, expect, it } from 'vitest';
import { createLedExampleProject } from '../../src/domain/project';
import { createBreadboardDefinition, terminalHoleId } from '../../src/domain/physical/breadboard';
import { connectionLearningTarget } from '../../src/state/connectionLearning';

describe('breadboard connection learning target', () => {
  const project = createLedExampleProject();
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const resistor = project.components.find((component) => component.kind === 'resistor');

  it('keeps a valid selected hole', () => {
    const selected = terminalHoleId(board.id, 'C', 7);
    expect(connectionLearningTarget(board, selected, resistor)).toBe(selected);
  });

  it('uses the selected component first terminal when no hole is selected', () => {
    expect(connectionLearningTarget(board, undefined, resistor)).toBe(resistor?.terminalHoleIds.a);
  });

  it('falls back to a visible middle terminal hole on an empty workbench', () => {
    expect(connectionLearningTarget(board, undefined, undefined)).toBe(terminalHoleId(board.id, 'E', 15));
  });
});
