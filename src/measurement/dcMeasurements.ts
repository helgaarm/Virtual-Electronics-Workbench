import type { SimulationResult } from '../domain/circuit/types';
import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import type { WorkbenchProject } from '../domain/project';
import type { CircuitExtraction } from '../simulation/circuitBuilder';

export type MeasurementStatus = 'valid' | 'unavailable' | 'disconnected' | 'simulation-error';

export interface MeasurementValue {
  status: MeasurementStatus;
  value?: number;
  reason?: string;
}

export interface ComponentMeasurement {
  voltage: MeasurementValue;
  current: MeasurementValue;
  power: MeasurementValue;
}

function unavailable(status: Exclude<MeasurementStatus, 'valid'>, reason: string): MeasurementValue {
  return { status, reason };
}

function valid(value: number): MeasurementValue {
  return Number.isFinite(value)
    ? { status: 'valid', value }
    : unavailable('simulation-error', 'The solver returned a non-finite value.');
}

export function measureComponent(
  component: PlacedComponent,
  extraction: CircuitExtraction,
  result: SimulationResult,
): ComponentMeasurement {
  if (result.status === 'error') {
    const reading = unavailable('simulation-error', result.errors[0]?.message ?? 'Simulation failed.');
    return { voltage: reading, current: reading, power: reading };
  }

  const terminals = terminalEntries(component);
  const terminalNodes = extraction.componentTerminalNodes[component.id];
  if (!terminalNodes || terminals.some(([name]) => !terminalNodes[name])) {
    const reading = unavailable('disconnected', 'The component is not connected to a valid electrical node.');
    return { voltage: reading, current: reading, power: reading };
  }

  const voltageTerminals = component.kind === 'ne555'
    ? ['pin8', 'pin1']
    : component.kind === 'tmp36'
      ? ['vout', 'gnd']
      : terminals.slice(0, 2).map(([name]) => name);
  const voltage = voltageTerminals.length >= 2
    ? (() => {
        const positive = result.nodeVoltages[terminalNodes[voltageTerminals[0]]];
        const negative = result.nodeVoltages[terminalNodes[voltageTerminals[1]]];
        return positive === undefined || negative === undefined
          ? unavailable('disconnected', 'One or more terminal nodes are unavailable.')
          : valid(positive - negative);
      })()
    : unavailable('unavailable', 'Voltage drop is not defined for a single-terminal component.');

  const currentValue = result.componentCurrents[component.id];
  const current = currentValue === undefined
    ? unavailable(
        'unavailable',
        component.kind === 'switch' || component.kind === 'jumper-wire'
          ? 'Ideal connectors are collapsed into a node; branch current is not calculated.'
          : 'Current is not available for this component.',
      )
    : valid(currentValue);
  const powerValue = result.componentPowers[component.id];
  const power = powerValue === undefined
    ? unavailable('unavailable', 'Power is not available for this component.')
    : valid(powerValue);

  return { voltage, current, power };
}

export function measureProbeVoltage(
  probe: WorkbenchProject['probes'][number] | undefined,
  extraction: CircuitExtraction,
  result: SimulationResult,
): MeasurementValue {
  if (!probe) return unavailable('disconnected', 'No probe is connected.');
  if (!probe.positiveHoleId && !probe.referenceHoleId) {
    return unavailable('disconnected', 'Attach the positive and COM leads to breadboard holes.');
  }
  if (!probe.positiveHoleId) {
    return unavailable('disconnected', 'Attach the positive lead to a breadboard hole.');
  }
  if (!probe.referenceHoleId) {
    return unavailable('disconnected', 'Attach the COM lead to a breadboard hole.');
  }
  if (result.status === 'error') {
    return unavailable('simulation-error', result.errors[0]?.message ?? 'Simulation failed.');
  }
  const positiveNode = extraction.holeToNodeId[probe.positiveHoleId];
  const referenceNode = extraction.holeToNodeId[probe.referenceHoleId];
  if (!positiveNode || !referenceNode) {
    return unavailable('disconnected', 'The probe references a hole that is not on the board.');
  }
  const positive = result.nodeVoltages[positiveNode];
  const reference = result.nodeVoltages[referenceNode];
  return positive === undefined || reference === undefined
    ? unavailable('disconnected', 'Probe nodes are not part of the current solution.')
    : valid(positive - reference);
}
