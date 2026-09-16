import type { Schematic } from '../domain/schematic/types';
import { drawSymbol, type SymbolDrawing } from './symbols';
import { escapeXml, path, text, wrappedText } from './svgPrimitives';
import { connectedCircuit } from './seriesParallel';
import { drawConnectedCircuit } from './connectedDrawing';

export type SchematicLayout = 'wires' | 'labels';
export interface SchematicDrawing { svg: string; width: number; height: number; layout: SchematicLayout }

export function canDrawConnectedWires(schematic: Schematic): boolean {
  return connectedCircuit(schematic) !== undefined;
}

export function renderSchematicSvg(schematic: Schematic, preferredLayout: SchematicLayout = 'wires'): SchematicDrawing {
  const circuit = preferredLayout === 'wires' ? connectedCircuit(schematic) : undefined;
  const connected = circuit ? drawConnectedCircuit(schematic, circuit) : undefined;
  const layout = connected ? 'wires' : 'labels';
  const symbols = schematic.components.map((component) => drawSymbol(component));
  const netNames = new Map(schematic.nets.map((net) => [net.id, net.name]));
  const columns = Math.min(3, Math.max(1, symbols.length));
  const width = connected?.width ?? columns * 400 + 40;
  const title = wrappedText(24, 34, schematic.title, Math.floor((width - 48) / 11), 20);
  const note = layout === 'wires'
    ? 'Dots join wires. Crossings without dots are not connected.'
    : 'Matching net labels are connected. NC means no valid board connection.';
  const header: string[] = [title.svg];
  let headerHeight = 57 + (title.lines - 1) * 24;
  const notes = [
    `${schematic.components.length} components · ${schematic.nets.length} nets · ${schematic.jumperCount} jumpers represented as connections`,
    note,
    ...(schematic.warnings.length ? [`${schematic.warnings.length} board connection warning(s). Check the board before using this drawing.`] : []),
  ];
  for (const line of notes) {
    const wrapped = wrappedText(24, headerHeight, line, Math.floor((width - 48) / 6.5), 11);
    header.push(wrapped.svg);
    headerHeight += wrapped.lines * 15 + 6;
  }
  headerHeight += 8;
  let y = headerHeight + (connected ? connected.height + 12 : 0);
  const placements: Array<{ symbol: SymbolDrawing; x: number; y: number }> = [];
  if (!connected) {
    for (let index = 0; index < symbols.length; index += columns) {
      const row = symbols.slice(index, index + columns);
      row.forEach((symbol, column) => placements.push({ symbol, x: 20 + column * 400, y }));
      y += Math.max(...row.map((symbol) => symbol.height)) + 24;
    }
  }
  const height = Math.max(260, y + 34);
  const elements: string[] = connected ? [`<g transform="translate(0 ${headerHeight})">${connected.body}</g>`] : [];
  for (const { symbol, x, y: top } of placements) {
    elements.push(`<g transform="translate(${x} ${top})">${symbol.body}</g>`);
    for (const terminal of symbol.pins) {
      const endX = x + terminal.x;
      const endY = top + terminal.y;
      const name = terminal.pin.netId ? netNames.get(terminal.pin.netId)! : 'NC';
      const startX = x + 12;
      const routeY = terminal.routeBelow ? top + symbol.height - 16 : endY;
      const d = terminal.routeBelow
        ? `M${endX} ${endY}H${endX + 26}V${routeY}H${startX}`
        : `M${startX} ${routeY}H${endX}`;
      elements.push(`<g data-net="${escapeXml(terminal.pin.netId ?? '')}"><title>${escapeXml(`${terminal.pin.name}: ${name}${terminal.pin.holeId ? ` (${terminal.pin.holeId})` : ''}`)}</title>${path(d, '#286e54')}`);
      elements.push(`<rect x="${startX - 4}" y="${routeY - 10}" width="42" height="19" rx="3" fill="white"/>${text(startX, routeY + 4, name, 11, '#286e54')}`);
      elements.push(`<circle cx="${endX}" cy="${endY}" r="3" fill="white" stroke="#286e54" stroke-width="1.5"/></g>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="schematic-title schematic-description">`
    + `<title id="schematic-title">${escapeXml(schematic.title)} — circuit schematic</title>`
    + `<desc id="schematic-description">${escapeXml(`${note} Jumpers and breadboard strips are represented by the connecting nets. ${schematic.warnings.join(' ')}`)}</desc>`
    + `<rect width="100%" height="100%" fill="white"/><g font-family="Arial, Helvetica, sans-serif">${header.join('')}`
    + (symbols.length ? elements.join('') : text(24, headerHeight + 35, 'Add components to the breadboard to generate a schematic.', 14))
    + '</g></svg>';
  return { svg, width, height, layout };
}
