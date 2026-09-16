import { ELECTRONIC_DEVICE_CATALOG } from '../components/catalog';
import { componentDisplayName, terminalEntries, type PlacedComponent } from '../components/types';
import { createBreadboardDefinition } from '../physical/breadboard';
import { physicalHoleNets } from '../physical/connectivity';
import { validateOccupancy } from '../physical/occupancy';
import type { WorkbenchProject } from '../project';
import type { Schematic, SchematicComponent } from './types';

function engineeringValue(value: number, unit: string): string {
  const scales: Array<[number, string]> = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const [scale, prefix] = scales.find(([scale]) => Math.abs(value) >= scale) ?? [1, ''];
  return `${Number((value / scale).toPrecision(4))} ${prefix}${unit}`;
}

function componentValue(component: PlacedComponent, project: WorkbenchProject): string {
  switch (component.kind) {
    case 'resistor': return `${engineeringValue(component.resistanceOhms, 'Ω')} ±${component.tolerancePercent}%`;
    case 'capacitor': return `${engineeringValue(component.capacitanceFarads, 'F')} / ${component.ratedVoltageV} V`;
    case 'potentiometer': return `${engineeringValue(component.totalResistanceOhms, 'Ω')} · ${Math.round(component.wiperPosition * 100)}%`;
    case 'voltage-source': return `${engineeringValue(component.voltageV, 'V')} DC${project.powerOn ? '' : ' (off)'}`;
    case 'switch': return component.closed ? 'Closed' : 'Open';
    case 'ground': return 'Ground';
    case 'led': return `${component.color} LED`;
    case 'tmp36': return `TMP36 · ${project.environment.temperatureC} °C`;
    default: return componentDisplayName(component.kind);
  }
}

function pinName(component: PlacedComponent, terminalId: string): string {
  if ('deviceId' in component && /^pin\d+$/.test(terminalId)) {
    const metadata = ELECTRONIC_DEVICE_CATALOG[component.deviceId];
    const pin = metadata.pins.find((candidate) => candidate.id === terminalId);
    if (pin) return `${pin.number} ${pin.name}`;
  }
  const names: Record<string, string> = {
    positive: '+', negative: '−', anode: 'A', cathode: 'K', ground: 'GND',
    collector: 'C', base: 'B', emitter: 'E', source: 'S', gate: 'G', drain: 'D',
    vs: '+VS', vout: 'VOUT', gnd: 'GND', wiper: 'W', common1: 'COM1', common2: 'COM2',
  };
  return names[terminalId] ?? terminalId.toUpperCase();
}

/** A drawing of physical wiring, independent of solver state and semiconductor internals. */
export function buildSchematic(project: WorkbenchProject): Schematic {
  const holeNets = physicalHoleNets(project);
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const warnings = validateOccupancy(board, project.components).map((issue) => issue.message);
  const components: SchematicComponent[] = project.components
    .filter((component) => component.kind !== 'jumper-wire')
    .map((component) => ({
      id: component.id,
      reference: component.label,
      kind: component.kind,
      value: componentValue(component, project),
      closed: component.kind === 'switch' ? component.closed : undefined,
      pins: terminalEntries(component).map(([id, holeId]) => ({ id, name: pinName(component, id), holeId, netId: holeNets[holeId] })),
    }));
  const generator = project.signalGenerator;
  if (generator.outputHoleId || generator.referenceHoleId) {
    components.push({
      id: 'schematic:signal-generator', reference: 'GEN', kind: 'signal-generator',
      value: `${generator.waveform} · ${engineeringValue(generator.frequencyHz, 'Hz')} · ${generator.amplitudeVpp} Vpp · ${generator.offsetV} V offset${generator.enabled ? '' : ' (off)'}`,
      pins: [
        { id: 'output', name: 'OUT', holeId: generator.outputHoleId, netId: generator.outputHoleId ? holeNets[generator.outputHoleId] : undefined },
        { id: 'reference', name: 'COM', holeId: generator.referenceHoleId, netId: generator.referenceHoleId ? holeNets[generator.referenceHoleId] : undefined },
      ],
    });
    if (!holeNets[generator.outputHoleId ?? ''] || !holeNets[generator.referenceHoleId ?? '']) {
      warnings.push('The signal generator has an unconnected or invalid lead.');
    }
  }
  const counts = new Map<string, number>();
  for (const component of components) {
    for (const pin of component.pins) {
      if (pin.netId) counts.set(pin.netId, (counts.get(pin.netId) ?? 0) + 1);
    }
  }
  const groundNets = new Set(components.filter((component) => component.kind === 'ground').flatMap((component) => component.pins.map((pin) => pin.netId)));
  let number = 0;
  const nets = [...counts.keys()].sort().map((id) => ({
    id, name: groundNets.has(id) ? 'GND' : `N${++number}`, terminalCount: counts.get(id)!,
  }));
  return {
    title: project.name, components, nets, warnings: [...new Set(warnings)],
    jumperCount: project.components.filter((component) => component.kind === 'jumper-wire').length,
  };
}
