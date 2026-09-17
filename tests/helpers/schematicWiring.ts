import { expect } from 'vitest';
import type { Schematic } from '../../src/domain/schematic/types';
import { renderSchematicSvg } from '../../src/schematic/renderSvg';

/** Inspect the exported conductors themselves: each net must be one continuous
 * drawing, and different nets can only meet at an unmarked straight crossing. */
export function verifyWiring(model: Schematic) {
  const drawing = renderSchematicSvg(model);
  expect(drawing.layout).toBe('wires');
  const document = new DOMParser().parseFromString(drawing.svg, 'image/svg+xml');
  expect(document.querySelector('parsererror, script, image, [onload]')).toBeNull();
  expect(document.querySelectorAll('[data-component-id]')).toHaveLength(model.components.length);
  expect(document.querySelectorAll('[data-net]')).toHaveLength(model.components.flatMap((part) => part.pins).length);
  for (const part of model.components) {
    for (const pin of part.pins) {
      const connection = [...document.querySelectorAll('[data-component-connection]')].find((group) => group.getAttribute('data-component-connection') === part.id && group.getAttribute('data-pin-id') === pin.id);
      expect(connection?.getAttribute('data-net')).toBe(pin.netId ?? '');
    }
  }
  const nets = new Map<string, Map<string, Set<string>>>();
  const point = (x: number, y: number) => `${x},${y}`;
  for (const group of document.querySelectorAll('[data-wire-net], [data-net]')) {
    const net = group.getAttribute('data-wire-net') ?? group.getAttribute('data-net')!;
    if (!net) continue;
    const graph = nets.get(net) ?? new Map<string, Set<string>>(); nets.set(net, graph);
    for (const path of group.querySelectorAll('path')) {
      let offsetX = 0; let offsetY = 0;
      for (let parent: Element | null = path.parentElement; parent && parent !== group.parentElement; parent = parent.parentElement) {
        const translate = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(parent.getAttribute('transform') ?? '');
        if (translate) { offsetX += Number(translate[1]); offsetY += Number(translate[2]); }
      }
      let x = 0; let y = 0;
      for (const [, command, argumentsText] of path.getAttribute('d')!.matchAll(/([MHV])([^MHV]+)/g)) {
        const values = argumentsText.trim().split(/\s+/).map(Number);
        const nextX = command === 'V' ? x : values[0];
        const nextY = command === 'M' ? values[1] : command === 'V' ? values[0] : y;
        if (command !== 'M') {
          const dx = Math.sign(nextX - x); const dy = Math.sign(nextY - y);
          expect(Number.isInteger(nextX) && Number.isInteger(nextY)).toBe(true);
          while (x !== nextX || y !== nextY) {
            const a = point(x + offsetX, y + offsetY); const b = point(x + dx + offsetX, y + dy + offsetY);
            graph.set(a, (graph.get(a) ?? new Set()).add(b));
            graph.set(b, (graph.get(b) ?? new Set()).add(a));
            x += dx; y += dy;
          }
        }
        x = nextX; y = nextY;
      }
    }
  }
  const owners = new Map<string, Array<{ net: string; neighbors: Set<string> }>>();
  for (const [net, graph] of nets) {
    const seen = new Set<string>(); const queue = [graph.keys().next().value!];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (seen.has(id)) continue;
      seen.add(id); queue.push(...graph.get(id)!);
    }
    expect(seen.size, `Every terminal of ${net} is joined by drawn wires`).toBe(graph.size);
    for (const [id, neighbors] of graph) owners.set(id, [...(owners.get(id) ?? []), { net, neighbors }]);
  }
  for (const [id, crossing] of owners) {
    if (crossing.length < 2) continue;
    expect(crossing, `Only two nets can cross at ${id}`).toHaveLength(2);
    const [x, y] = id.split(',').map(Number);
    const axes = crossing.map(({ neighbors }) => {
      expect(neighbors.size, `No false branch, endpoint or overlap at ${id}`).toBe(2);
      if (neighbors.has(point(x - 1, y)) && neighbors.has(point(x + 1, y))) return 'horizontal';
      expect(neighbors.has(point(x, y - 1)) && neighbors.has(point(x, y + 1)), `No corner crossing at ${id}`).toBe(true);
      return 'vertical';
    });
    expect(new Set(axes).size, `No coincident wires at ${id}`).toBe(2);
    expect(document.querySelector(`[data-junction-net][cx="${x}"][cy="${y}"]`)).toBeNull();
  }
  for (const junction of document.querySelectorAll('[data-junction-net]')) {
    const net = junction.getAttribute('data-junction-net')!;
    const id = `${junction.getAttribute('cx')},${junction.getAttribute('cy')}`;
    expect(nets.get(net)?.get(id)?.size, `A dot must mark an actual branch at ${id}`).toBeGreaterThan(2);
  }
  return document;
}
