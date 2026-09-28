// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../../src/domain/starterProjects';
import { buildSchematic } from '../../src/domain/schematic/buildSchematic';
import type { Schematic, SchematicComponent } from '../../src/domain/schematic/types';
import { connectedCircuit } from '../../src/schematic/seriesParallel';
import { renderSchematicSvg } from '../../src/schematic/renderSvg';

function parse(model: Schematic) { return new DOMParser().parseFromString(renderSchematicSvg(model).svg, 'image/svg+xml'); }
function placement(document: Document, id: string) {
  const transform = document.querySelector(`[data-component-id="${id}"]`)!.parentElement!.getAttribute('transform')!;
  const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform)!;
  return { x: Number(x), y: Number(y) };
}
function network(edges: Array<[string, string, string]>): Schematic {
  const source: SchematicComponent = { id: 'V', reference: 'V', kind: 'voltage-source', value: '5 V', pins: [
    { id: 'positive', name: '+', netId: 'supply' }, { id: 'negative', name: '-', netId: 'ground' },
  ] };
  const components: SchematicComponent[] = [source, ...edges.map(([id, from, to]): SchematicComponent => ({
    id, reference: id, kind: 'resistor', value: '1 kΩ', pins: [{ id: 'a', name: 'A', netId: from }, { id: 'b', name: 'B', netId: to }],
  }))];
  return { title: 'Circuit', components, nets: [...new Set(components.flatMap((part) => part.pins.map((pin) => pin.netId!)))].map((id) => ({ id, name: id, terminalCount: components.flatMap((part) => part.pins).filter((pin) => pin.netId === id).length })), warnings: [], jumperCount: 0 };
}

// The exported conductor paths contain only orthogonal SVG commands. Check
// the actual drawn wire groups, rather than trusting graph-reduction metadata.
function conductorSegments(document: Document) {
  const result: Array<{ net: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (const group of document.querySelectorAll('[data-wire-net], [data-net]')) {
    const net = group.getAttribute('data-wire-net') ?? group.getAttribute('data-net')!;
    for (const path of group.querySelectorAll('path')) {
      let x = 0; let y = 0;
      for (const [, command, argumentsText] of path.getAttribute('d')!.matchAll(/([MHV])([^MHV]+)/g)) {
        const values = argumentsText.trim().split(/\s+/).map(Number);
        const nextX = command === 'V' ? x : values[0];
        const nextY = command === 'M' ? values[1] : command === 'V' ? values[0] : y;
        if (command !== 'M') result.push({ net, x1: x, y1: y, x2: nextX, y2: nextY });
        x = nextX; y = nextY;
      }
    }
  }
  return result;
}

describe('conventional schematic layout', () => {
  it('draws the divider as a compact loop, stacked resistors and a midpoint tap', () => {
    const model = buildSchematic(createStarterProject('voltage-divider'));
    const drawing = renderSchematicSvg(model);
    const document = parse(model);
    const source = placement(document, 'V1');
    const upper = placement(document, 'R1');
    const lower = placement(document, 'R2');
    expect(drawing.layout).toBe('wires');
    expect(drawing.height).toBeLessThan(620);
    expect(drawing.width).toBeLessThan(800);
    expect(upper.x).toBe(lower.x);
    expect(source.x).toBeLessThan(upper.x);
    expect(upper.y).toBeLessThan(source.y);
    expect(source.y).toBeLessThan(lower.y);
    const midpoint = model.components.find((part) => part.id === 'R1')!.pins.find((pin) => pin.id === 'b')!.netId;
    expect([...document.querySelectorAll('[data-wire-net]')].some((group) => group.getAttribute('data-wire-net') === midpoint)).toBe(true);
    expect(document.querySelectorAll('[data-component-id]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-net]')).toHaveLength(7);
  });

  it('places parallel series branches side by side, with one shared supply and return', () => {
    const model = network([['R1', 'supply', 'a'], ['R2', 'a', 'ground'], ['R3', 'supply', 'b'], ['R4', 'b', 'ground']]);
    const document = parse(model);
    const r1 = placement(document, 'R1'); const r2 = placement(document, 'R2');
    const r3 = placement(document, 'R3'); const r4 = placement(document, 'R4');
    expect(r1.x).toBe(r2.x); expect(r3.x).toBe(r4.x);
    expect(r1.x).not.toBe(r3.x);
    expect(r1.y).toBe(r3.y); expect(r2.y).toBe(r4.y);
    const segments = conductorSegments(document);
    const endpoints = new Map<string, string>();
    for (const segment of segments) {
      for (const [x, y] of [[segment.x1, segment.y1], [segment.x2, segment.y2]]) {
        const key = `${x},${y}`;
        if (endpoints.has(key)) expect(endpoints.get(key), `No false junction at ${key}`).toBe(segment.net);
        endpoints.set(key, segment.net);
      }
    }
    for (const net of ['supply', 'ground']) {
      expect(segments.some((segment) => segment.net === net && Math.abs(segment.x2 - segment.x1) >= Math.abs(r3.x - r1.x))).toBe(true);
    }
  });

  it('retains diode polarity when the net direction or serialized pin order is reversed', () => {
    const model = network([['D1', 'ground', 'supply']]);
    model.components[1] = { ...model.components[1], kind: 'led', pins: [
      { id: 'cathode', name: 'K', netId: 'supply' }, { id: 'anode', name: 'A', netId: 'ground' },
    ] };
    const document = parse(model);
    const led = document.querySelector('[data-component-id="D1"]')!;
    expect(led.querySelector('[transform="rotate(180 150 120)"]')).not.toBeNull();
    expect(document.querySelector('[data-component-connection="D1"][data-pin-id="anode"]')?.getAttribute('data-net')).toBe('ground');
    expect(document.querySelector('[data-component-connection="D1"][data-pin-id="cathode"]')?.getAttribute('data-net')).toBe('supply');
    const reordered = { ...model, components: model.components.map((part) => ({ ...part, pins: [...part.pins].reverse() })) };
    expect(renderSchematicSvg(reordered).svg).toBe(renderSchematicSvg(model).svg);
  });

  it('routes bridges and disconnected circuits while keeping the explicit label option', () => {
    const bridge = network([['R1', 'supply', 'a'], ['R2', 'a', 'ground'], ['R3', 'supply', 'b'], ['R4', 'b', 'ground'], ['R5', 'a', 'b']]);
    const disconnected = network([['R1', 'supply', 'ground'], ['R2', 'unused1', 'unused2']]);
    for (const model of [bridge, disconnected]) {
      expect(connectedCircuit(model)).toBeUndefined();
      expect(renderSchematicSvg(model).layout).toBe('wires');
      expect(renderSchematicSvg(model, 'labels').layout).toBe('labels');
      const document = parse(model);
      expect(document.querySelectorAll('[data-component-id]')).toHaveLength(model.components.length);
      expect(document.querySelectorAll('[data-net]')).toHaveLength(model.components.length * 2);
    }
  });

  it('escapes names in connected exports without turning them into SVG markup', () => {
    const model = network([['R1', 'supply', 'ground']]);
    model.title = '<script>bad</script>';
    model.components[0].reference = '<V&>';
    model.components[0].id = '" onload="bad';
    model.components[1].value = '<image onload="bad">';
    expect(renderSchematicSvg(model).layout).toBe('wires');
    const document = parse(model);
    expect(document.querySelector('parsererror, script, image, [onload]')).toBeNull();
    expect(document.querySelectorAll('[data-component-id]')).toHaveLength(2);
    expect(document.documentElement.textContent).toContain('<V&>');
  });
});
