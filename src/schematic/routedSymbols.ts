import type { Schematic, SchematicComponent, SchematicPin } from '../domain/schematic/types';
import type { RoutingBox } from './orthogonalRouter';
import { drawSymbol } from './symbols';
import { escapeXml, text, wrappedText } from './svgPrimitives';

export interface SymbolPort { pin: SchematicPin; x: number; y: number; direction: number; lead: string }
export interface RoutedSymbol { body: string; ports: SymbolPort[]; boxes: RoutingBox[]; width: number; height: number }
const primitives = new Set(['ntc-thermistor', 'heater-resistor', 'resistor', 'capacitor', 'led', 'diode-1n4148', 'zener-1n4733a', 'switch', 'voltage-source', 'signal-generator', 'ground', 'potentiometer', 'bc547', 'bc557', '2n3904', '2n3906', '2n7000']);
export const pinFunction = (pin: SchematicPin) => pin.name.replace(/^\d+\s+/, '');
export const groundPin = (pin: SchematicPin) => /^(GND|VSS|COM[12]?)$/.test(pinFunction(pin));
export const supplyPin = (pin: SchematicPin) => /^(VCC|VIN|5V|3V3|\+VS|V\+)$/.test(pinFunction(pin));
const orderPins = (a: SchematicPin, b: SchematicPin) => a.id.localeCompare(b.id, 'en', { numeric: true });

/** Layout-only symbols: pin identity comes from the extracted model, never from
 * component labels, sketch contents or a guessed physical connection. */
export function routedSymbol(component: SchematicComponent, model: Schematic): RoutedSymbol {
  if (primitives.has(component.kind)) {
    const symbol = drawSymbol(component, { inline: true, hideLabels: true });
    const ports: SymbolPort[] = symbol.pins.map(({ pin, x, y }) => {
      if (y === 68 || y === 172) {
        const py = y < 120 ? 60 : 180;
        return { pin, x: 160, y: py, direction: y < 120 ? 3 : 1, lead: `M160 ${y}V${py}` };
      }
      const px = x < 150 ? 100 : 260;
      return { pin, x: px, y: 120, direction: x < 150 ? 2 : 0, lead: `M${x + 10} 120H${px}` };
    });
    const hasSidePin = ports.some((port) => port.y === 120);
    const labelX = component.kind === 'led' ? 226 : hasSidePin ? 210 : 198;
    const labelY = hasSidePin ? 28 : 111;
    const reference = wrappedText(labelX, labelY, component.reference, 24, 14);
    const value = wrappedText(labelX, labelY + reference.lines * 18 + 4, component.value, 28, 11);
    const labelBottom = labelY + reference.lines * 18 + value.lines * 15 + 4;
    const width = Math.ceil((labelX + Math.max(Math.min(24, component.reference.length) * 8, Math.min(28, component.value.length) * 6) + 20) / 20) * 20;
    return { body: `<g transform="translate(10 0)">${symbol.body}</g>` + reference.svg + value.svg, ports,
      width: Math.max(340, width), height: Math.ceil(Math.max(220, labelBottom + 20) / 20) * 20,
      boxes: [
        { left: 130, right: component.kind === 'led' ? 212 : 190, top: 78, bottom: component.kind === 'ground' ? 140 : 162 },
        { left: labelX - 4, right: width - 10, top: labelY - 16, bottom: labelBottom },
        ...ports.filter((port) => port.y === 120).map((port) => ({ left: port.x === 100 ? 115 : 205, right: port.x === 100 ? 145 : 245, top: 114, bottom: 126 })),
      ] };
  }
  const sorted = [...component.pins].sort(orderPins);
  const neighbors = (pin: SchematicPin) => pin.netId ? model.components.filter((other) => other !== component && other.pins.some((p) => p.netId === pin.netId)) : [];
  let left: SchematicPin[]; let right: SchematicPin[];
  if (component.kind === 'arduino-nano') {
    right = sorted.filter((pin) => /^D\d/.test(pinFunction(pin)) && !neighbors(pin).some((part) => ['switch', 'potentiometer', 'tmp36'].includes(part.kind)));
    left = sorted.filter((pin) => !right.includes(pin));
  } else {
    left = sorted.slice(0, Math.ceil(sorted.length / 2));
    right = sorted.slice(left.length).reverse();
  }
  const priority = (pin: SchematicPin) => neighbors(pin).length ? groundPin(pin) ? 2 : supplyPin(pin) ? 1 : 0 : 3;
  left.sort((a, b) => priority(a) - priority(b)); right.sort((a, b) => priority(a) - priority(b));
  const height = Math.max(240, 160 + Math.max(left.length, right.length) * 20);
  const ports: SymbolPort[] = [];
  const boxes: RoutingBox[] = [{ left: 70, right: 450, top: 4, bottom: height - 30 }];
  const labels: string[] = [];
  for (const [side, pins] of [left, right].entries()) {
    pins.forEach((pin, index) => {
      const x = side === 0 ? 40 : 480; const y = 100 + index * 20;
      ports.push({ pin, x, y, direction: side === 0 ? 2 : 0, lead: `M${x} ${y}H${side === 0 ? 80 : 440}` });
      labels.push(`<g${side ? ' text-anchor="end"' : ''}>${text(side ? 428 : 92, y + 4, pin.name, 11)}</g>`);
      boxes.push({ left: x + (side ? -25 : 15), right: x + (side ? -15 : 25), top: y - 4, bottom: y + 4 });
    });
  }
  const reference = wrappedText(260, 22, component.reference, 42, 15);
  const value = wrappedText(260, 26 + reference.lines * 19, component.value, 52, 11);
  // Long names use the complete label view rather than overlapping pin rows.
  return { body: `<g data-component-id="${escapeXml(component.id)}"><title>${escapeXml(`${component.reference}: ${component.value}`)}</title>`
    + `<g text-anchor="middle">${reference.svg}${value.svg}</g>`
    + `<rect x="80" y="60" width="360" height="${height - 100}" fill="white" stroke="#273c35" stroke-width="2"/>${labels.join('')}</g>`,
    ports, boxes, width: 520, height };
}
