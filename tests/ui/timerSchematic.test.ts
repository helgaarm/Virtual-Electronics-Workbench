// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../../src/domain/starterProjects';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import type { Schematic } from '../../src/domain/schematic/types';
import { canDrawConnectedWires, renderSchematicSvg } from '../../src/schematic/renderSvg';
import { verifyWiring } from '../helpers/schematicWiring';

function timer() { return buildSchematic(createStarterProject('ne555-astable')); }
function pin(model: Schematic, part: string, id: string) { return model.components.find((item) => item.id === part)!.pins.find((item) => item.id === id)!; }

describe('555 connected schematic', () => {
  it('draws every component and pin of the user’s timer circuit with actual continuous nets', () => {
    const model = timer(); const document = verifyWiring(model);
    expect(canDrawConnectedWires(model)).toBe(true);
    expect(document.querySelectorAll('[data-junction-net]').length).toBeGreaterThan(5);
    expect(document.documentElement.textContent).toContain('5 CTRL');
    expect(document.documentElement.textContent).toContain('(open)');
    // The current board really has a floating control pin and capacitor return.
    expect(pin(model, 'U1', 'pin5').netId).not.toBe(pin(model, 'C2', 'positive').netId);
    expect(pin(model, 'C2', 'negative').netId).not.toBe(pin(model, 'GND1', 'ground').netId);
  });

  it('routes a connected control capacitor according to edited nets', () => {
    const model = timer();
    pin(model, 'C2', 'positive').netId = pin(model, 'U1', 'pin5').netId;
    pin(model, 'C2', 'negative').netId = pin(model, 'U1', 'pin1').netId;
    expect(verifyWiring(model).documentElement.textContent).not.toContain('(open)');
  });

  it('preserves reverse polarity, changed reset wiring, unplaced pins and an extra branch', () => {
    const model = timer();
    pin(model, 'U1', 'pin4').netId = pin(model, 'U1', 'pin1').netId;
    const led = model.components.find((part) => part.id === 'LED1')!;
    const [anode, cathode] = [pin(model, 'LED1', 'anode'), pin(model, 'LED1', 'cathode')];
    [anode.netId, cathode.netId] = [cathode.netId, anode.netId];
    pin(model, 'C2', 'negative').netId = undefined;
    model.components.push({ ...led, id: 'Z-extra-led', reference: 'Extra LED', pins: led.pins.map((pin) => ({ ...pin })) });
    const document = verifyWiring(model);
    expect(document.querySelector('[data-component-id="LED1"] [transform="rotate(180 150 120)"]')).not.toBeNull();
    expect(document.documentElement.textContent).toContain('NC (open)');
  });

  it('does not invent power or ground connections when the source or marker is removed', () => {
    const model = timer();
    model.components = model.components.filter((part) => part.kind !== 'voltage-source' && part.kind !== 'ground');
    verifyWiring(model);
  });

  it('is independent of serialized pin/component order, power state and component labels', () => {
    const model = timer(); const original = renderSchematicSvg(model).svg;
    model.components.reverse(); model.components.forEach((part) => part.pins.reverse());
    expect(renderSchematicSvg(model).svg).toBe(original);
    const project = createStarterProject('ne555-astable'); project.powerOn = false;
    const off = buildSchematic(project);
    off.title = '<script>timer</script>'; off.components.find((part) => part.id === 'U1')!.reference = '<U&1>';
    const document = verifyWiring(off);
    expect(document.documentElement.textContent).toContain('9 V DC (off)');
    expect(document.documentElement.textContent).toContain('<U&1>');
    expect(renderSchematicSvg(model, 'labels').layout).toBe('labels');
  });

  it('routes multiple timers and keeps a complete label drawing for oversized circuits', () => {
    const model = timer();
    model.components.push({ ...model.components.find((part) => part.id === 'U1')!, id: 'U2', reference: 'U2' });
    verifyWiring(model);
    model.components = Array.from({ length: 60 }, (_, index) => ({ ...model.components[0], id: `V${index}` }));
    const drawing = renderSchematicSvg(model);
    expect(drawing.layout).toBe('labels');
    expect(new DOMParser().parseFromString(drawing.svg, 'image/svg+xml').querySelectorAll('[data-component-id]')).toHaveLength(model.components.length);
  });
});
