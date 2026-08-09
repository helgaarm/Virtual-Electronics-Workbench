import type { PlacedComponent } from '../components/types';
import { terminalEntries } from '../components/types';
import type { WorkbenchProject } from '../project';
import { extractCircuit } from '../../simulation/circuitBuilder';
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

export function convertBreadboardToPcb(project: WorkbenchProject): PcbConversionResult {
  const extraction = extractCircuit(project);
  const candidates = project.components.filter((component) => !excludedKinds.has(component.kind));
  const missing = candidates.filter((component) => !footprintForKind(component.kind)).map((component) => ({ componentId: component.id, reason: `No verified THT footprint is assigned for ${component.kind}.` }));
  if (missing.length) return { missing };
  const components: PcbComponent[] = candidates.map((component, index) => ({
    id: `pcb-${component.id}`, sourceComponentId: component.id, reference: component.label,
    value: valueOf(component), footprintId: footprintForKind(component.kind)!.id,
    positionMm: { xMm: 10 + (index % 4) * 14, yMm: 10 + Math.floor(index / 4) * 14 },
    rotationDegrees: component.rotation, locked: false,
  }));
  const netMap = new Map<string, PcbNet>();
  for (const source of candidates) {
    const footprint = footprintForKind(source.kind)!;
    for (const [terminalId, sourceHoleId] of terminalEntries(source)) {
      const nodeId = extraction.componentTerminalNodes[source.id]?.[terminalId];
      const pad = footprint.pads.find((candidate) => candidate.terminalId === terminalId);
      if (!nodeId || !pad) continue;
      const net = netMap.get(nodeId) ?? { id: nodeId, name: nodeId === extraction.circuit.groundNodeId ? 'GND' : nodeId, pads: [] };
      net.pads.push({ componentId: `pcb-${source.id}`, padNumber: pad.number, terminalId, sourceHoleId });
      netMap.set(nodeId, net);
    }
  }
  return { missing: [], pcb: { version: 1, sourceCircuitFingerprint: circuitFingerprint(project), board: { widthMm: 70, heightMm: Math.max(35, 20 + Math.ceil(components.length / 4) * 14), title: project.name }, components, nets: [...netMap.values()].filter((net) => net.pads.length > 1), traces: [], jumpers: [], mountingHoles: [], rules: DEFAULT_PCB_RULES } };
}
