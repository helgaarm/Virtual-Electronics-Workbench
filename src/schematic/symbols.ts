import type { SchematicComponent, SchematicPin } from '../domain/schematic/types';
import { escapeXml, path, text, wrappedText } from './svgPrimitives';

export interface DrawingPin { pin: SchematicPin; x: number; y: number; routeBelow?: boolean }
export interface SymbolDrawing { body: string; pins: DrawingPin[]; height: number }

/** Original procedural symbols. All coordinates are drawing units, never package millimetres. */
export function drawSymbol(component: SchematicComponent, options?: { inline: boolean; reverse?: boolean; labelLeft?: boolean; hideLabels?: boolean }): SymbolDrawing {
  const reference = wrappedText(16, 20, component.reference, 38, 14);
  const value = wrappedText(16, 24 + reference.lines * 18, component.value, 48, 11);
  const offset = options?.inline ? 0 : Math.max(0, reference.lines * 18 + value.lines * 15 - 33);
  const label = reference.svg + value.svg;
  const pins: DrawingPin[] = [];
  const pin = (id: string, x: number, y: number, routeBelow = false) => {
    const terminal = component.pins.find((item) => item.id === id);
    if (terminal) pins.push({ pin: terminal, x, y: y + offset, routeBelow });
  };
  const twoPins = (top: string, bottom: string) => {
    pin(top, 150, 68);
    pin(bottom, 150, 172);
  };
  let body = '';
  let height = 210;
  let showPinLabels = true;
  const leads = path('M150 68V98 M150 142V172');
  switch (component.kind) {
    case 'resistor':
    case 'potentiometer':
      body = leads + path('M137 98H163V142H137Z');
      if (component.kind === 'potentiometer') {
        pin('a', 150, 68); pin('b', 150, 172); pin('wiper', 215, 120, true);
        body += path('M215 120H169 M179 114L169 120L179 126');
        height = 238;
      } else twoPins('a', 'b');
      break;
    case 'capacitor':
      twoPins('positive', 'negative');
      body = path('M150 68V114 M129 114H171 M129 126H171 M150 126V172') + text(174, 109, '+', 16);
      break;
    case 'led':
    case 'diode-1n4148':
    case 'zener-1n4733a':
      twoPins('anode', 'cathode');
      body = path('M150 68V104 M135 104H165L150 134Z M150 134V172');
      body += component.kind === 'zener-1n4733a' ? path('M132 129V134H168V139') : path('M134 134H166');
      if (component.kind === 'led') body += path('M174 112L192 94 M184 94H192V102 M180 128L198 110 M190 110H198V118');
      break;
    case 'switch':
      twoPins('a', 'b');
      body = path(`M150 68V96 M150 144V172 M150 96L${component.closed ? 150 : 178} 142`)
        + '<circle cx="150" cy="96" r="3" fill="white" stroke="#273c35" stroke-width="2"/><circle cx="150" cy="144" r="3" fill="white" stroke="#273c35" stroke-width="2"/>';
      break;
    case 'voltage-source':
    case 'signal-generator':
      if (component.kind === 'voltage-source') twoPins('positive', 'negative');
      else twoPins('output', 'reference');
      body = path('M150 68V98 M150 142V172') + '<circle cx="150" cy="120" r="22" fill="white" stroke="#273c35" stroke-width="2"/>';
      body += component.kind === 'voltage-source' ? text(144, 117, '+', 18) + text(144, 136, '−', 18) : path('M134 120Q142 102 150 120T166 120');
      break;
    case 'ground':
      pin('ground', 150, 68);
      body = path('M150 68V113 M130 113H170 M137 121H163 M144 129H156');
      height = 170;
      break;
    case 'bc547': case 'bc557': case '2n3904': case '2n3906': {
      pin('collector', 150, 68); pin('base', 110, 120); pin('emitter', 150, 172);
      const pnp = component.kind === 'bc557' || component.kind === '2n3906';
      body = path('M150 68V90L125 108 M110 120H125 M125 98V142 M125 132L150 150V172');
      body += `<path d="${pnp ? 'M129 135L143 139L136 148Z' : 'M148 149L134 145L141 136Z'}" fill="#273c35"/>`;
      break;
    }
    case '2n7000':
      pin('drain', 150, 68); pin('gate', 110, 120); pin('source', 150, 172);
      body = path('M110 120H126 M126 97V144 M138 96V108 M138 115V125 M138 132V144 M150 68V96H138 M138 144H150V172 M138 120H153V144 M143 116L138 120L143 124');
      break;
    default:
      // Complex devices retain every external pin; internal solver subcircuits are never drawn.
      showPinLabels = false;
      height = 105 + component.pins.length * 26;
      body = `<rect x="108" y="60" width="245" height="${component.pins.length * 26 + 22}" rx="3" fill="#f9fbf9" stroke="#273c35" stroke-width="2"/>`;
      component.pins.forEach((terminal, index) => {
        const y = 83 + index * 26;
        pin(terminal.id, 88, y);
        body += path(`M88 ${y}H108`) + text(118, y + 4, terminal.name, 11);
      });
  }
  if (options?.inline) {
    const labelX = options.labelLeft ? 112 : component.kind === 'led' ? 216 : 188;
    const labels = wrappedText(labelX, 111, component.reference, options.labelLeft ? 10 : component.kind === 'led' ? 20 : 24, 14);
    const values = wrappedText(labelX, 115 + labels.lines * 18, component.value, options.labelLeft ? 12 : 24, 11);
    return { body: `<g data-component-id="${escapeXml(component.id)}"><title>${escapeXml(`${component.reference}: ${component.value}`)}</title>`
      + `<g${options.reverse ? ' transform="rotate(180 150 120)"' : ''}>${body}</g>`
      + (options.hideLabels ? '' : `<g${options.labelLeft ? ' text-anchor="end"' : ''}>${labels.svg}${values.svg}</g>`) + '</g>',
    pins: pins.map((item) => options.reverse ? { ...item, x: 300 - item.x, y: 240 - item.y } : item), height: 104 };
  }
  const pinLabels = showPinLabels ? pins.map((item) => text(item.x + 7, item.y - offset - 6, item.pin.name, 10)).join('') : '';
  return {
    body: `<g data-component-id="${escapeXml(component.id)}"><title>${escapeXml(`${component.reference}: ${component.value}`)}</title>${label}<g transform="translate(0 ${offset})">${body}${pinLabels}</g></g>`,
    pins, height: height + offset,
  };
}
