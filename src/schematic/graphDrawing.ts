import type { Schematic, SchematicComponent } from '../domain/schematic/types';
import { routeOrthogonalNets, orthogonalPath, type RoutingPort, type RoutingBox } from './orthogonalRouter';
import { groundPin, routedSymbol, supplyPin, type RoutedSymbol, type SymbolPort } from './routedSymbols';
import { escapeXml, path } from './svgPrimitives';

interface PlacedSymbol { component: SchematicComponent; symbol: RoutedSymbol; x: number; y: number }
interface Terminal extends RoutingPort { part: SchematicComponent; port: SymbolPort }
interface Branch { parts: SchematicComponent[]; side: 'left' | 'right'; y: number; columns: number; width: number }

/** General fallback for compact circuits, including Nano peripherals, transistors,
 * sensors and multiple ICs. Connectivity only influences placement; routed nets
 * always retain every original terminal, even for floating or invalid circuits. */
export function drawGraphCircuit(model: Schematic): { body: string; width: number; height: number; note: string } | undefined {
  if (!model.components.length || model.components.length > 48 || model.components.flatMap((part) => part.pins).length > 192) return undefined;
  if (model.components.some((part) => part.reference.length > 42 || part.value.length > 52 || part.pins.some((pin) => pin.name.length > 27))) return undefined;
  const components = [...model.components].sort((a, b) => a.id.localeCompare(b.id));
  const root = [...components].sort((a, b) => b.pins.length - a.pins.length || Number(b.kind === 'voltage-source') - Number(a.kind === 'voltage-source'))[0];
  const symbols = new Map(components.map((part) => [part, routedSymbol(part, model)]));
  if (components.some((part) => symbols.get(part)!.ports.length !== part.pins.length)) return undefined;
  const rootSymbol = symbols.get(root)!;
  const hubs = new Set<string>();
  for (const part of components) for (const pin of part.pins) {
    if (pin.netId && (part.kind === 'ground' || groundPin(pin) || supplyPin(pin) || part.kind === 'voltage-source')) hubs.add(pin.netId);
  }
  const ground = components.find((part) => part.kind === 'ground');
  const groundNet = ground?.pins[0]?.netId ?? rootSymbol.ports.find((port) => groundPin(port.pin))?.pin.netId;
  const source = components.find((part) => part.kind === 'voltage-source');
  const supplyNet = source?.pins.find((pin) => pin.id === 'positive')?.netId;
  const remaining = new Set(components.filter((part) => part !== root && part !== ground));
  const shareSignal = (a: SchematicComponent, b: SchematicComponent) => a.pins.some((pin) => pin.netId && !hubs.has(pin.netId) && b.pins.some((other) => other.netId === pin.netId));
  const branches: Branch[] = [];
  while (remaining.size) {
    const first = [...remaining].find((part) => shareSignal(root, part)) ?? [...remaining][0];
    const parts = [first]; remaining.delete(first);
    for (let i = 0; i < parts.length; i++) for (const other of remaining) {
      if (shareSignal(parts[i], other)) { parts.push(other); remaining.delete(other); }
    }
    const connection = rootSymbol.ports.find((port) => port.pin.netId && !hubs.has(port.pin.netId) && parts.some((part) => part.pins.some((pin) => pin.netId === port.pin.netId)));
    const side = connection?.direction === 2 || parts.some((part) => part.kind === 'voltage-source') ? 'left' : 'right';
    branches.push({ parts, side, y: Math.max(180, 140 + (connection?.y ?? 100) - 60), columns: Math.ceil(parts.length / 4),
      width: Math.max(...parts.map((part) => symbols.get(part)!.width)) + 40 });
  }
  const leftWidth = branches.filter((branch) => branch.side === 'left').reduce((width, branch) => width + branch.columns * branch.width, 0);
  const rootX = 120 + leftWidth;
  const placements: PlacedSymbol[] = [{ component: root, symbol: rootSymbol, x: rootX, y: 140 }];
  let left = rootX; let right = rootX + rootSymbol.width + 40;
  for (const branch of branches) {
    let x: number;
    if (branch.side === 'left') { left -= branch.columns * branch.width; x = left; }
    else { x = right; right += branch.columns * branch.width; }
    let y = branch.y;
    branch.parts.forEach((component, index) => {
      if (index % 4 === 0) y = branch.y;
      const symbol = symbols.get(component)!;
      placements.push({ component, symbol, x: x + Math.floor(index / 4) * branch.width, y });
      y += symbol.height + 20;
    });
  }
  const bottom = Math.max(...placements.map((part) => part.y + part.symbol.height)) + 80;
  if (ground && ground !== root) placements.push({ component: ground, symbol: symbols.get(ground)!, x: rootX + 100, y: bottom - 40 });
  const width = Math.ceil(Math.max(640, ...placements.map((part) => part.x + part.symbol.width + 60)) / 20) * 20;
  const height = Math.ceil((bottom + (ground ? 220 : 80)) / 20) * 20;
  const bodies: string[] = []; const leads: string[] = []; const boxes: RoutingBox[] = []; const ports: Terminal[] = [];
  for (const { component, symbol, x, y } of placements) {
    bodies.push(`<g transform="translate(${x} ${y})">${symbol.body}</g>`);
    boxes.push(...symbol.boxes.map((box) => ({ left: x + box.left, right: x + box.right, top: y + box.top, bottom: y + box.bottom })));
    for (const port of symbol.ports) {
      ports.push({ part: component, port, x: x + port.x, y: y + port.y, direction: port.direction,
        net: port.pin.netId ?? `open:${component.id}:${port.pin.id}` });
      leads.push(`<g data-component-connection="${escapeXml(component.id)}" data-pin-id="${escapeXml(port.pin.id)}" data-net="${escapeXml(port.pin.netId ?? '')}"><title>${escapeXml(`${component.reference} ${port.pin.name}`)}</title><g transform="translate(${x} ${y})">${path(port.lead)}</g></g>`);
    }
  }
  const rails = new Map<string, number>();
  if (supplyNet) rails.set(supplyNet, 60);
  if (groundNet && groundNet !== supplyNet) rails.set(groundNet, bottom);
  const routed = routeOrthogonalNets(ports, boxes, width, height, rails);
  if (!routed) return undefined;
  const wires: string[] = []; const markers: string[] = [];
  for (const route of routed) {
    const terminals = ports.filter((port) => port.net === route.net);
    const id = terminals[0].port.pin.netId ?? '';
    wires.push(`<g data-wire-net="${escapeXml(id)}">${route.paths.map((points) => path(orthogonalPath(points))).join('')}</g>`);
    markers.push(...route.junctions.map((point) => `<circle data-junction-net="${escapeXml(id)}" cx="${point.x}" cy="${point.y}" r="3.5" fill="#273c35"/>`));
    if (terminals.length === 1) {
      const endpoint = route.paths[0].at(-1)!;
      markers.push(`<g data-open-pin="${escapeXml(terminals[0].port.pin.id)}"><title>${escapeXml(`${terminals[0].part.reference} ${terminals[0].port.pin.name}: ${id ? 'unused / open' : 'NC'}`)}</title>`
        + `<circle cx="${endpoint.x}" cy="${endpoint.y}" r="3" fill="white" stroke="#273c35" stroke-width="1.5"/></g>`);
    }
  }
  return { body: wires.join('') + leads.join('') + bodies.join('') + markers.join(''), width, height,
    note: 'Open circles mark unused or unconnected pins. NC means no valid board connection.' };
}
