import type { Schematic, SchematicComponent, SchematicPin } from '../domain/schematic/types';
import { drawSymbol } from './symbols';
import type { CircuitBranch, ConnectedCircuit } from './seriesParallel';
import { escapeXml, path, text } from './svgPrimitives';

interface MeasuredBranch { branch: CircuitBranch; width: number; height: number; portX: number; children: MeasuredBranch[] }
function measure(branch: CircuitBranch): MeasuredBranch {
  if (branch.kind === 'component') return { branch, width: 240, height: 160, portX: 56, children: [] };
  const children = branch.children.map(measure);
  if (branch.kind === 'series') {
    const portX = Math.max(...children.map((child) => child.portX));
    return { branch, children, portX, width: portX + Math.max(...children.map((child) => child.width - child.portX)),
      height: children.reduce((sum, child) => sum + child.height, 0) };
  }
  const width = children.reduce((sum, child) => sum + child.width, 0);
  return { branch, children, width, height: Math.max(...children.map((child) => child.height)) + 64,
    portX: (children[0].portX + width - children.at(-1)!.width + children.at(-1)!.portX) / 2 };
}

export function drawConnectedCircuit(schematic: Schematic, circuit: ConnectedCircuit): { body: string; width: number; height: number } {
  const tree = measure(circuit.branch);
  const width = Math.max(600, tree.width + 320);
  const elements: string[] = [];
  const names = new Map(schematic.nets.map((net) => [net.id, net.name]));
  const annotations = new Set<string>();
  const wire = (net: string, d: string) => elements.push(`<g data-wire-net="${escapeXml(net)}">${path(d)}</g>`);
  const dot = (x: number, y: number) => elements.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="#273c35"/>`);
  const terminalWire = (component: SchematicComponent, pin: SchematicPin, d: string) => {
    elements.push(`<g data-component-connection="${escapeXml(component.id)}" data-pin-id="${escapeXml(pin.id)}" data-net="${escapeXml(pin.netId ?? '')}"><title>${escapeXml(`${component.reference} ${pin.name}: ${names.get(pin.netId!) ?? 'NC'}`)}</title>${path(d)}</g>`);
  };
  const component = (part: SchematicComponent, x: number, top: number, bottom: number, from: string, source = false) => {
    const symbol = drawSymbol(part, { inline: true, reverse: part.pins.find((pin) => pin.id === symbolTopPin(part))?.netId !== from, labelLeft: source });
    const centerY = (top + bottom) / 2;
    elements.push(`<g transform="translate(${x - 150} ${centerY - 120})">${symbol.body}</g>`);
    for (const pin of symbol.pins) {
      const y = centerY + pin.y - 120;
      terminalWire(part, pin.pin, `M${x} ${pin.y < 120 ? top : bottom}V${y}`);
    }
  };
  const annotate = (net: string, x: number, y: number) => {
    if (annotations.has(net)) return;
    annotations.add(net);
    wire(net, `M${x} ${y}H${x + 58}`);
    dot(x, y);
    elements.push(text(x + 65, y + 4, names.get(net) ?? net, 12));
  };
  const place = (node: MeasuredBranch, left: number, top: number, height: number) => {
    const x = left + node.portX;
    const bottom = top + height;
    if (node.branch.kind === 'component') {
      component(node.branch.component, x, top, bottom, node.branch.from);
    } else if (node.branch.kind === 'series') {
      let y = top;
      for (const [index, child] of node.children.entries()) {
        const childHeight = height * child.height / node.height;
        place(child, x - child.portX, y, childHeight);
        y += childHeight;
        if (index < node.children.length - 1) annotate(child.branch.to, x, y);
      }
    } else {
      let childLeft = left;
      const childXs: number[] = [];
      for (const child of node.children) {
        childXs.push(childLeft + child.portX);
        place(child, childLeft, top + 32, height - 64);
        childLeft += child.width;
      }
      wire(node.branch.from, `M${x} ${top}V${top + 32} M${childXs[0]} ${top + 32}H${childXs.at(-1)}`);
      wire(node.branch.to, `M${x} ${bottom}V${bottom - 32} M${childXs[0]} ${bottom - 32}H${childXs.at(-1)}`);
      dot(x, top + 32); dot(x, bottom - 32);
      childXs.slice(1, -1).forEach((childX) => { dot(childX, top + 32); dot(childX, bottom - 32); });
    }
  };
  const top = 26;
  const bottom = top + tree.height;
  const branchX = 280 + tree.portX;
  place(tree, 280, top, tree.height);
  component(circuit.source, 120, top, bottom, circuit.branch.from, true);
  wire(circuit.branch.from, `M120 ${top}H${branchX}`);
  wire(circuit.branch.to, `M120 ${bottom}H${branchX}`);
  elements.push(text(136, top - 8, names.get(circuit.branch.from) ?? '', 11));
  if (circuit.ground) {
    const ground = circuit.ground;
    dot(branchX, bottom);
    terminalWire(ground, ground.pins[0], `M${branchX} ${bottom}V${bottom + 22}`);
    elements.push(`<g data-component-id="${escapeXml(ground.id)}"><title>${escapeXml(ground.reference)}</title>`
      + path(`M${branchX - 18} ${bottom + 22}H${branchX + 18} M${branchX - 11} ${bottom + 30}H${branchX + 11} M${branchX - 4} ${bottom + 38}H${branchX + 4}`)
      + text(branchX - 13, bottom + 58, 'GND', 11) + '</g>');
  } else elements.push(text(136, bottom + 20, names.get(circuit.branch.to) ?? '', 11));
  return { body: elements.join(''), width, height: bottom + 80 };
}

function symbolTopPin(component: SchematicComponent): string {
  if (['led', 'diode-1n4148', 'zener-1n4733a'].includes(component.kind)) return 'anode';
  if (component.kind === 'capacitor' || component.kind === 'voltage-source') return 'positive';
  if (component.kind === 'signal-generator') return 'output';
  return 'a';
}
