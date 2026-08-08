import { describe, expect, it } from 'vitest';
import { isComponentAnchored } from '../../src/domain/components/types';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { createLedExampleProject } from '../../src/domain/project';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { createPlacedComponent } from '../../src/state/workbenchActions';

describe('component placement anchoring', () => {
  it('treats existing components as anchored by default', () => {
    const project = createLedExampleProject();

    expect(project.components.every(isComponentAnchored)).toBe(true);
  });

  it('creates new components anchored and permits an explicit unanchored state', () => {
    const board = createBreadboardDefinition();
    const component = createPlacedComponent('resistor', board, []);
    if (!component) throw new Error('Resistor was not created.');

    expect(component.anchored).toBe(true);
    expect(isComponentAnchored(component)).toBe(true);
    expect(isComponentAnchored({ ...component, anchored: false })).toBe(false);
  });

  it('preserves an unanchored component through project validation', () => {
    const project = createLedExampleProject();
    project.components[0] = { ...project.components[0], anchored: false };

    const migrated = migrateProjectDocument(structuredClone(project));

    expect(migrated.components[0].anchored).toBe(false);
    expect(isComponentAnchored(migrated.components[0])).toBe(false);
  });
});
