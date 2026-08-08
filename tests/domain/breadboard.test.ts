import { describe, expect, it } from 'vitest';
import { connectedHoleIds, createBreadboardDefinition, railHoleId, terminalHoleId } from '../../src/domain/physical/breadboard';
import { validateOccupancy } from '../../src/domain/physical/occupancy';
import { createLedExampleProject } from '../../src/domain/project';
import { rotatePlacedComponent } from '../../src/state/workbenchActions';

describe('breadboard physical model', () => {
  it('uses a 2.54 mm pitch and creates terminal and split rail holes', () => {
    const board = createBreadboardDefinition('main', 30);
    expect(board.pitchMm).toBe(2.54);
    expect(board.holes).toHaveLength(30 * 14);
    const a1 = board.holes.find((hole) => hole.id === terminalHoleId('main', 'A', 1))!;
    const a2 = board.holes.find((hole) => hole.id === terminalHoleId('main', 'A', 2))!;
    expect(a2.positionMm.x - a1.positionMm.x).toBeCloseTo(2.54, 8);
  });

  it('connects each five-hole terminal strip but not the opposite bank', () => {
    const board = createBreadboardDefinition('main', 30);
    const connected = connectedHoleIds(board, terminalHoleId('main', 'E', 15));
    expect(connected).toHaveLength(5);
    expect(connected).toContain(terminalHoleId('main', 'A', 15));
    expect(connected).not.toContain(terminalHoleId('main', 'F', 15));
  });

  it('splits power rails every fifteen columns', () => {
    const board = createBreadboardDefinition('main', 30);
    const firstSection = connectedHoleIds(board, railHoleId('main', 'top', 'positive', 1));
    expect(firstSection).toHaveLength(15);
    expect(firstSection).toContain(railHoleId('main', 'top', 'positive', 15));
    expect(firstSection).not.toContain(railHoleId('main', 'top', 'positive', 16));
  });

  it('has valid non-overlapping occupancy in the starter project', () => {
    const project = createLedExampleProject();
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    expect(validateOccupancy(board, project.components)).toEqual([]);
  });

  it('rotates a resistor and snaps its second lead to a matching free hole', () => {
    const project = createLedExampleProject();
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    const resistor = project.components.find((component) => component.kind === 'resistor');
    if (!resistor || resistor.kind !== 'resistor') throw new Error('Starter resistor is missing.');
    const rotated = rotatePlacedComponent(board, resistor, project.components);
    if (!rotated || rotated.kind !== 'resistor') throw new Error('Resistor did not rotate.');
    expect(rotated?.rotation).toBe(90);
    expect(rotated?.terminalHoleIds.b).not.toBe(resistor.terminalHoleIds.b);
    const oldA = board.holes.find((hole) => hole.id === resistor.terminalHoleIds.a)!;
    const oldB = board.holes.find((hole) => hole.id === resistor.terminalHoleIds.b)!;
    const newB = board.holes.find((hole) => hole.id === rotated?.terminalHoleIds.b)!;
    expect(Math.hypot(newB.positionMm.x - oldA.positionMm.x, newB.positionMm.z - oldA.positionMm.z))
      .toBeCloseTo(Math.abs(oldB.positionMm.x - oldA.positionMm.x), 8);
  });
});
