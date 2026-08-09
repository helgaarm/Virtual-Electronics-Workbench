import type { PlacedComponent } from '../components/types';
import { terminalEntries } from '../components/types';
import type { WorkbenchProject } from '../project';
import { createBreadboardDefinition } from '../physical/breadboard';
import { UnionFind } from '../../simulation/unionFind';
import { footprintForKind } from './footprints';
import { DEFAULT_PCB_RULES, type PcbComponent, type PcbNet, type PcbProject } from './types';

export interface PcbConversionResult { pcb?: PcbProject; missing: Array<{ componentId: string; reason: string }> }
const excludedKinds = new Set<PlacedComponent['kind']>(['ground', 'jumper-wire']);

function valueOf(component: PlacedComponent): string {
  switch (component.kind) {
    case 'resistor': return `${component.resistanceOhms} Ω`;
    case 'capacitor': return `${component.capacitanceFarads} F`;
    case 'led': return `${component.color} LED`;
    case 'switch': return component.closed ? 'Normally open switch (closed)' : 'Normally open switch';
    case 'ne555': return 'NE555N';
    case 'voltage-source': return `${component.voltageV} V input`;
    default: return component.label;
  }
}

export function circuitFingerprint(project: WorkbenchProject): string {
  return JSON.stringify(project.components.map((component) => [component.id, component.kind, terminalEntries(component)]));
}

/** Build permanent physical copper groups. Device behaviour (notably switch.closed) is excluded. */
function physicalHoleNets(project: WorkbenchProject): Record<string, string> {
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const union = new UnionFind();
  const firstByStrip = new Map<string, string>();
  for (const hole of board.holes) {
    union.add(hole.id);
    const first = firstByStrip.get(hole.stripId);
    if (first) union.union(first, hole.id); else firstByStrip.set(hole.stripId, hole.id);
  }
  for (const component of project.components) {
    if (component.kind === 'jumper-wire') union.union(component.terminalHoleIds.a, component.terminalHoleIds.b);
  }
  const groundHoles = project.components.filter((component) => component.kind === 'ground').map((component) => component.terminalHoleIds.ground);
  for (const hole of groundHoles.slice(1)) union.union(groundHoles[0], hole);
  const groups = new Map<string, string[]>();
  for (const hole of board.holes) {
    const root = union.find(hole.id); const members = groups.get(root) ?? []; members.push(hole.id); groups.set(root, members);
  }
  const stableId = new Map([...groups].map(([root, holes]) => [root, `pcb-net-${[...holes].sort()[0]}`]));
  return Object.fromEntries(board.holes.map((hole) => [hole.id, stableId.get(union.find(hole.id))!]));
}

function placeComponents(candidates: readonly PlacedComponent[]): { components: PcbComponent[]; widthMm: number; heightMm: number } {
  const marginMm = 6; const gapMm = 5; const targetColumns = Math.max(2, Math.ceil(Math.sqrt(candidates.length)));
  const rows: Array<{ items: Array<{ source: PlacedComponent; widthMm: number; heightMm: number }>; heightMm: number; widthMm: number }> = [];
  for (let index = 0; index < candidates.length; index += targetColumns) {
    const items = candidates.slice(index, index + targetColumns).map((source) => {
      const footprint = footprintForKind(source.kind)!; const swapped = source.rotation === 90 || source.rotation === 270;
      return { source, widthMm: (swapped ? footprint.bodySizeMm.heightMm : footprint.bodySizeMm.widthMm) + footprint.courtyardMarginMm * 2, heightMm: (swapped ? footprint.bodySizeMm.widthMm : footprint.bodySizeMm.heightMm) + footprint.courtyardMarginMm * 2 };
    });
    rows.push({ items, heightMm: Math.max(...items.map((item) => item.heightMm)), widthMm: items.reduce((sum, item) => sum + item.widthMm, 0) + gapMm * Math.max(0, items.length - 1) });
  }
  const widthMm = Math.max(35, marginMm * 2 + Math.max(...rows.map((row) => row.widthMm), 0));
  const heightMm = Math.max(35, marginMm * 2 + rows.reduce((sum, row) => sum + row.heightMm, 0) + gapMm * Math.max(0, rows.length - 1));
  const components: PcbComponent[] = []; let yMm = marginMm;
  for (const row of rows) {
    let xMm = (widthMm - row.widthMm) / 2;
    for (const item of row.items) {
      const source = item.source;
      components.push({ id: `pcb-${source.id}`, sourceComponentId: source.id, reference: source.label, value: valueOf(source), footprintId: footprintForKind(source.kind)!.id, positionMm: { xMm: xMm + item.widthMm / 2, yMm: yMm + row.heightMm / 2 }, rotationDegrees: source.rotation, locked: false });
      xMm += item.widthMm + gapMm;
    }
    yMm += row.heightMm + gapMm;
  }
  return { components, widthMm, heightMm };
}

export function convertBreadboardToPcb(project: WorkbenchProject): PcbConversionResult {
  const candidates = project.components.filter((component) => !excludedKinds.has(component.kind));
  const missing = candidates.filter((component) => !footprintForKind(component.kind)).map((component) => ({ componentId: component.id, reason: `No verified THT footprint is assigned for ${component.kind}.` }));
  if (missing.length) return { missing };
  const placement = placeComponents(candidates); const components = placement.components;
  const holeNets = physicalHoleNets(project);
  const netMap = new Map<string, PcbNet>();
  for (const source of candidates) {
    const footprint = footprintForKind(source.kind)!;
    for (const [terminalId, sourceHoleId] of terminalEntries(source)) {
      const nodeId = holeNets[sourceHoleId];
      const pad = footprint.pads.find((candidate) => candidate.terminalId === terminalId);
      if (!nodeId || !pad) return { missing: [{ componentId: source.id, reason: `Terminal ${terminalId} cannot be mapped to a physical PCB pad and net.` }] };
      const net = netMap.get(nodeId) ?? { id: nodeId, name: nodeId, pads: [] };
      net.pads.push({ componentId: `pcb-${source.id}`, padNumber: pad.number, terminalId, sourceHoleId });
      netMap.set(nodeId, net);
    }
  }
  const nets = [...netMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const groundHoles = new Set(project.components.filter((component) => component.kind === 'ground').map((component) => component.terminalHoleIds.ground));
  for (const net of nets) if (net.pads.some((pad) => groundHoles.has(pad.sourceHoleId))) net.name = 'GND';
  return { missing: [], pcb: { version: 1, sourceCircuitFingerprint: circuitFingerprint(project), board: { widthMm: placement.widthMm, heightMm: placement.heightMm, title: project.name }, components, nets, traces: [], jumpers: [], mountingHoles: [], rules: DEFAULT_PCB_RULES } };
}
