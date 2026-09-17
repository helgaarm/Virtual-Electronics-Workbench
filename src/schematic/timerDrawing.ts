import type { Schematic, SchematicComponent, SchematicPin } from '../domain/schematic/types';
import { drawSymbol } from './symbols';
import { escapeXml, path, text, wrappedText } from './svgPrimitives';
import { orthogonalPath, routeOrthogonalNets, type RoutingBox, type RoutingPort } from './orthogonalRouter';

interface Terminal extends RoutingPort { component: SchematicComponent; pin: SchematicPin }
interface Placement { component: SchematicComponent; x: number; y: number; topPin?: string }
const twoTerminalKinds = ['resistor', 'capacitor', 'led', 'diode-1n4148', 'zener-1n4733a', 'switch', 'voltage-source', 'signal-generator'];
const naturalTopPin = (part: SchematicComponent) => part.kind === 'voltage-source' || part.kind === 'capacitor' ? 'positive'
  : part.kind === 'signal-generator' ? 'output' : ['led', 'diode-1n4148', 'zener-1n4733a'].includes(part.kind) ? 'anode' : 'a';

/** Placement follows the timer's pin functions; all wires still come exclusively
 * from the extracted nets. Rewiring, open pins and extra parts are retained. */
export function drawTimerCircuit(schematic: Schematic): { body: string; width: number; height: number } | undefined {
  const timers = schematic.components.filter((part) => part.kind === 'ne555');
  if (timers.length !== 1 || schematic.components.length > 16 || schematic.nets.length > 32) return undefined;
  if (schematic.components.some((part) => part.reference.length > 48 || part.value.length > 72)) return undefined;
  const timer = timers[0];
  if (timer.pins.length !== 8 || Array.from({ length: 8 }, (_, index) => `pin${index + 1}`).some((id) => !timer.pins.some((pin) => pin.id === id))) return undefined;
  if (schematic.components.some((part) => part !== timer && (part.kind === 'ground' ? part.pins.length !== 1 : !twoTerminalKinds.includes(part.kind) || part.pins.length !== 2))) return undefined;
  const net = (id: string) => timer.pins.find((pin) => pin.id === id)?.netId;
  const unplaced = schematic.components.filter((part) => part !== timer).sort((a, b) => a.id.localeCompare(b.id));
  const placements: Placement[] = [];
  const place = (component: SchematicComponent, x: number, y: number, topNet?: string) => {
    placements.push({ component, x, y, topPin: component.pins.find((pin) => topNet && pin.netId === topNet)?.id });
    unplaced.splice(unplaced.indexOf(component), 1);
  };
  const between = (kind: string, a?: string, b?: string) => a && b && a !== b
    ? unplaced.find((part) => part.kind === kind && part.pins.some((pin) => pin.netId === a) && part.pins.some((pin) => pin.netId === b)) : undefined;
  const source = unplaced.find((part) => part.kind === 'voltage-source' || part.kind === 'signal-generator');
  if (source) place(source, 120, 380);
  const ground = unplaced.find((part) => part.kind === 'ground');
  if (ground) place(ground, 700, 720);
  const upper = between('resistor', net('pin8'), net('pin7'));
  if (upper) place(upper, 320, 180, net('pin8'));
  const lower = between('resistor', net('pin7'), net('pin6')) ?? between('resistor', net('pin7'), net('pin2'));
  if (lower) place(lower, 320, 340, net('pin7'));
  const timing = between('capacitor', net('pin6'), net('pin1')) ?? between('capacitor', net('pin2'), net('pin1'));
  if (timing) place(timing, 320, 540, net('pin6') ?? net('pin2'));
  let outputNet = net('pin3');
  for (const y of [340, 540]) {
    if (!outputNet || outputNet === net('pin1') || outputNet === net('pin8')) break;
    const part = unplaced.find((part) => part.kind !== 'ground' && part.pins.some((pin) => pin.netId === outputNet));
    if (!part) break;
    place(part, 1120, y, outputNet);
    outputNet = part.pins.find((pin) => pin.netId !== outputNet)?.netId;
  }
  const control = unplaced.find((part) => part.kind === 'capacitor' && part.pins.some((pin) => pin.netId && pin.netId === net('pin5')))
    ?? unplaced.find((part) => part.kind === 'capacitor');
  if (control) place(control, 920, 560, net('pin5'));
  // Unmatched components are still drawn and wired, including floating branches.
  [...unplaced].forEach((part, index) => place(part, 1440 + Math.floor(index / 3) * 280, 180 + index % 3 * 180));
  const width = Math.max(1380, ...placements.map((part) => part.x + 240));
  const height = 800;
  const bodies: string[] = []; const leads: string[] = [];
  const boxes: RoutingBox[] = [{ left: 570, top: 190, right: 830, bottom: 510 }];
  const terminals: Terminal[] = [];
  const names = new Map(schematic.nets.map((item) => [item.id, item.name]));
  const terminal = (component: SchematicComponent, pin: SchematicPin, x: number, y: number, direction: number, lead: string) => {
    // Each unplaced/invalid pin is its own open connection; never merge NCs.
    terminals.push({ component, pin, x, y, direction, net: pin.netId ?? `open:${component.id}:${pin.id}` });
    leads.push(`<g data-component-connection="${escapeXml(component.id)}" data-pin-id="${escapeXml(pin.id)}" data-net="${escapeXml(pin.netId ?? '')}"><title>${escapeXml(`${component.reference} ${pin.name}: ${names.get(pin.netId!) ?? 'NC'}`)}</title>${path(lead)}</g>`);
  };
  const timerPins = [
    { id: 'pin8', x: 640, y: 160, direction: 3, d: 'M640 160V200', tx: 610, ty: 222, label: '8 VCC' },
    { id: 'pin4', x: 760, y: 160, direction: 3, d: 'M760 160V200', tx: 724, ty: 222, label: '4 RESET' },
    { id: 'pin7', x: 540, y: 260, direction: 2, d: 'M540 260H580', tx: 592, ty: 264, label: '7 DISCH' },
    { id: 'pin6', x: 540, y: 380, direction: 2, d: 'M540 380H580', tx: 592, ty: 384, label: '6 THRESH' },
    { id: 'pin2', x: 540, y: 440, direction: 2, d: 'M540 440H580', tx: 592, ty: 444, label: '2 TRIG' },
    { id: 'pin3', x: 860, y: 280, direction: 0, d: 'M820 280H860', tx: 764, ty: 284, label: '3 OUT' },
    { id: 'pin5', x: 860, y: 460, direction: 0, d: 'M820 460H860', tx: 754, ty: 464, label: '5 CTRL' },
    { id: 'pin1', x: 700, y: 540, direction: 1, d: 'M700 500V540', tx: 680, ty: 484, label: '1 GND' },
  ];
  const reference = wrappedText(700, 305, timer.reference, 22, 15);
  bodies.push(`<g data-component-id="${escapeXml(timer.id)}"><title>${escapeXml(`${timer.reference}: ${timer.value}`)}</title>`
    + '<rect x="580" y="200" width="240" height="300" fill="white" stroke="#273c35" stroke-width="2"/>'
    + `<g text-anchor="middle">${reference.svg}${text(700, 313 + reference.lines * 19, 'NE555N', 14)}</g>`
    + timerPins.map((pin) => text(pin.tx, pin.ty, pin.label, 12)).join('') + '</g>');
  for (const position of timerPins) {
    terminal(timer, timer.pins.find((pin) => pin.id === position.id)!, position.x, position.y, position.direction, position.d);
    // Keep routed wires away from the interior of each fixed IC pin lead.
    const x = position.x + (position.direction === 0 ? -20 : position.direction === 2 ? 20 : 0);
    const y = position.y + (position.direction === 1 ? -20 : position.direction === 3 ? 20 : 0);
    boxes.push({ left: x - 5, right: x + 5, top: y - 5, bottom: y + 5 });
  }
  for (const { component, x, y, topPin } of placements) {
    if (component.kind === 'ground') {
      terminal(component, component.pins[0], x, y - 20, 3, `M${x} ${y - 20}V${y}`);
      bodies.push(`<g data-component-id="${escapeXml(component.id)}"><title>${escapeXml(component.reference)}</title>`
        + path(`M${x - 20} ${y}H${x + 20} M${x - 12} ${y + 8}H${x + 12} M${x - 4} ${y + 16}H${x + 4}`) + text(x - 13, y + 36, 'GND', 11) + '</g>');
      boxes.push({ left: x - 30, right: x + 30, top: y - 5, bottom: y + 40 });
      continue;
    }
    const sourceLabel = component === source;
    const symbol = drawSymbol(component, { inline: true, reverse: topPin !== undefined && topPin !== naturalTopPin(component), labelLeft: sourceLabel });
    bodies.push(`<g transform="translate(${x - 150} ${y - 120})">${symbol.body}</g>`);
    boxes.push({ left: x - 30, right: x + (sourceLabel ? 30 : 60), top: y - 42, bottom: y + 42 });
    const labelOffset = component.kind === 'led' ? 66 : 38;
    const labelWidth = Math.max(Math.min(component.reference.length, 24) * 8, Math.min(component.value.length, 24) * 6) + 10;
    const referenceLines = wrappedText(0, 0, component.reference, sourceLabel ? 10 : component.kind === 'led' ? 20 : 24, 14).lines;
    const valueLines = wrappedText(0, 0, component.value, sourceLabel ? 12 : 24, 11).lines;
    boxes.push({ left: x + (sourceLabel ? -115 : labelOffset - 2), right: x + (sourceLabel ? -34 : labelOffset + labelWidth),
      top: y - 24, bottom: y + 18 * referenceLines + 15 * valueLines + 8 });
    for (const pin of symbol.pins) {
      const upper = pin.y < 120; const endY = y + (upper ? -60 : 60);
      terminal(component, pin.pin, x, endY, upper ? 3 : 1, `M${x} ${y + pin.y - 120}V${endY}`);
    }
  }
  const rails = new Map<string, number>();
  const supplyNet = source?.pins.find((pin) => pin.id === 'positive' || pin.id === 'output')?.netId;
  const returnNet = ground?.pins[0]?.netId ?? source?.pins.find((pin) => pin.id === 'negative' || pin.id === 'reference')?.netId;
  if (supplyNet) rails.set(supplyNet, 60);
  if (returnNet && returnNet !== supplyNet) rails.set(returnNet, 660);
  const routed = routeOrthogonalNets(terminals, boxes, width, height, rails);
  if (!routed) return undefined;
  const wires: string[] = []; const annotations: string[] = [];
  for (const route of routed) {
    const routeTerminals = terminals.filter((pin) => pin.net === route.net);
    const netId = routeTerminals[0].pin.netId;
    wires.push(`<g data-wire-net="${escapeXml(netId ?? '')}">${route.paths.map((points) => path(orthogonalPath(points))).join('')}</g>`);
    annotations.push(...route.junctions.map((point) => `<circle data-junction-net="${escapeXml(netId ?? '')}" cx="${point.x}" cy="${point.y}" r="3.5" fill="#273c35"/>`));
    if (routeTerminals.length === 1) {
      const endpoint = route.paths[0].at(-1)!;
      const rightFacing = routeTerminals[0].direction === 0;
      annotations.push(`<circle cx="${endpoint.x}" cy="${endpoint.y}" r="3" fill="white" stroke="#273c35" stroke-width="1.5"/>`
        + `<g${rightFacing ? ' text-anchor="end"' : ''}>${text(endpoint.x + (rightFacing ? 20 : 8), endpoint.y - 10, `${names.get(netId!) ?? 'NC'} (open)`, 11)}</g>`);
    }
  }
  return { body: wires.join('') + leads.join('') + bodies.join('') + annotations.join(''), width, height };
}
