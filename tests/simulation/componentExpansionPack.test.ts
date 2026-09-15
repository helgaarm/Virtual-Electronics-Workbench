import { describe, expect, it } from 'vitest';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { createEmptyProject } from '../../src/domain/project';
import { createPlacedComponent } from '../../src/state/workbenchActions';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { migrateProjectDocument } from '../../src/persistence/migrations';

const kinds = ['lm358', '2n7000', '74hc00', 'zener-1n4733a'] as const;

describe('component expansion pack', () => {
  it.each(kinds)('creates a breadboard-placeable %s with stable terminals', (kind) => {
    const component = createPlacedComponent(kind, createBreadboardDefinition('main', 30), []);
    expect(component?.kind).toBe(kind);
    expect(Object.values(component?.terminalHoleIds ?? {})).not.toHaveLength(0);
    expect(new Set(Object.values(component?.terminalHoleIds ?? {})).size)
      .toBe(Object.values(component?.terminalHoleIds ?? {}).length);
  });

  it('extracts each device into generic solver primitives', () => {
    const project = createEmptyProject('Expansion devices');
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    for (const kind of kinds) {
      const component = createPlacedComponent(kind, board, project.components);
      if (!component) throw new Error(`Could not place ${kind}.`);
      project.components.push(component);
    }
    const extraction = extractCircuit(project);
    expect(extraction.errors).toEqual([]);
    expect(extraction.circuit.components.filter((component) => component.kind === 'subcircuit')).toHaveLength(2);
    expect(extraction.circuit.components.some((component) => component.id.includes(':channel'))).toBe(true);
    expect(extraction.circuit.components.some((component) => component.id.includes(':breakdown'))).toBe(true);
    expect(migrateProjectDocument(structuredClone(project)).components.map((component) => component.kind))
      .toEqual(kinds);
  });
});
