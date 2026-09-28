// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStarterProject, STARTER_PROJECTS } from '../../src/domain/starterProjects';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import { renderSchematicSvg } from '../../src/schematic/renderSvg';
import { verifyWiring } from '../helpers/schematicWiring';
import type { ComponentKind } from '../../src/domain/components/types';
import { PHYSICAL_PACKAGES } from '../../src/domain/physical/packages';
import { createPlacedComponent } from '../../src/state/workbenchActions';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { createEmptyProject } from '../../src/domain/project';

describe('general connected circuit drawings', () => {
  it.each(['nano-blink', 'nano-button', 'nano-analog'] as const)('wires every pin of %s, including both ground and reset headers', (id) => {
    const project = createStarterProject(id); const before = JSON.stringify(project);
    const model = buildSchematic(project); const document = verifyWiring(model);
    expect(JSON.stringify(project)).toBe(before);
    expect(document.querySelectorAll('[data-component-connection="Nano1"]')).toHaveLength(30);
    expect(document.querySelectorAll('[data-open-pin]').length).toBeGreaterThan(20);
    expect(document.documentElement.textContent).toContain('16 D13');
    expect(document.documentElement.textContent).toContain('4 GND');
    expect(document.documentElement.textContent).toContain('29 GND');
    expect(renderSchematicSvg(model, 'labels').layout).toBe('labels');
  });

  it.each(STARTER_PROJECTS)('offers a connected drawing for $name', ({ id }) => {
    const model = buildSchematic(createStarterProject(id));
    expect(renderSchematicSvg(model).layout).toBe('wires');
  });

  it.each(['first-press-wins', 'digital-thermometer'] as const)('routes all actual nets of the larger %s circuit without false junctions', (id) => {
    verifyWiring(buildSchematic(createStarterProject(id)));
  });

  it('covers every component family, including floating and unattached pins', () => {
    for (const kind of Object.keys(PHYSICAL_PACKAGES) as ComponentKind[]) {
      if (kind === 'jumper-wire') continue;
      const component = createPlacedComponent(kind, createBreadboardDefinition(), [])!;
      verifyWiring(buildSchematic({ ...createEmptyProject(), components: [component] }));
    }
  });

  it('routes Nano edits by their actual pins, with stable output independent of serialized order', () => {
    const model = buildSchematic(createStarterProject('nano-button'));
    const nano = model.components.find((part) => part.kind === 'arduino-nano')!;
    const resistor = model.components.find((part) => part.kind === 'resistor')!;
    resistor.pins[0].netId = nano.pins.find((pin) => pin.id === 'pin6')!.netId;
    const button = model.components.find((part) => part.kind === 'switch')!;
    button.closed = true;
    button.pins[0].netId = undefined;
    verifyWiring(model);
    const original = renderSchematicSvg(model).svg;
    model.components.reverse(); model.components.forEach((part) => part.pins.reverse());
    expect(renderSchematicSvg(model).svg).toBe(original);
  });

  it('escapes imported names and keeps complete labels when routing limits are exceeded', () => {
    const model = buildSchematic(createStarterProject('nano-analog'));
    model.title = '<script>bad</script>';
    model.components[0].id = '" onload="bad';
    model.components[0].reference = '<Nano&>';
    verifyWiring(model);
    model.components = Array.from({ length: 60 }, (_, index) => ({ ...model.components[1], id: `R${index}` }));
    const drawing = renderSchematicSvg(model);
    expect(drawing.layout).toBe('labels');
    expect(new DOMParser().parseFromString(drawing.svg, 'image/svg+xml').querySelectorAll('[data-component-id]')).toHaveLength(60);
  });
});
