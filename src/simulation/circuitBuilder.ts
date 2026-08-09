import type { Circuit, ElectricalComponent, SimulationMessage } from '../domain/circuit/types';
import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import { SIGNAL_GENERATOR_COMPONENT_ID } from '../domain/instruments/types';
export { SIGNAL_GENERATOR_COMPONENT_ID } from '../domain/instruments/types';
import type { WorkbenchProject } from '../domain/project';
import { createBreadboardDefinition } from '../domain/physical/breadboard';
import { validateOccupancy } from '../domain/physical/occupancy';
import { UnionFind } from './unionFind';
import { createNe555Subcircuit } from './models/ne555';
import { tmp36Output } from './models/tmp36';

export interface CircuitExtraction {
  circuit: Circuit;
  holeToNodeId: Record<string, string>;
  componentTerminalNodes: Record<string, Record<string, string>>;
  warnings: SimulationMessage[];
  errors: SimulationMessage[];
}

function endpoints(component: PlacedComponent): [string, string] | undefined {
  if (component.kind === 'switch' || component.kind === 'jumper-wire') {
    return [component.terminalHoleIds.a, component.terminalHoleIds.b];
  }
  return undefined;
}

export function extractCircuit(project: WorkbenchProject): CircuitExtraction {
  const board = createBreadboardDefinition(project.board.id, project.board.columns);
  const union = new UnionFind();
  const stripFirstHole = new Map<string, string>();

  for (const hole of board.holes) {
    union.add(hole.id);
    const first = stripFirstHole.get(hole.stripId);
    if (first) union.union(first, hole.id);
    else stripFirstHole.set(hole.stripId, hole.id);
  }

  for (const component of project.components) {
    const pair = endpoints(component);
    const conducts =
      component.kind === 'jumper-wire' || (component.kind === 'switch' && component.closed);
    if (pair && conducts) {
      union.union(pair[0], pair[1]);
    }
  }

  const groundHoles = project.components
    .filter((component) => component.kind === 'ground')
    .map((component) => component.terminalHoleIds.ground);
  if (groundHoles.length > 1) {
    for (const holeId of groundHoles.slice(1)) union.union(groundHoles[0], holeId);
  }

  const roots = [...new Set(board.holes.map((hole) => union.find(hole.id)))];
  const nodeIdByRoot = new Map(roots.map((root, index) => [root, `node-${index + 1}`]));
  const holeToNodeId = Object.fromEntries(
    board.holes.map((hole) => [hole.id, nodeIdByRoot.get(union.find(hole.id))!]),
  );

  const warnings: SimulationMessage[] = [];
  const errors: SimulationMessage[] = validateOccupancy(board, project.components).map((issue) => ({
    code: issue.code,
    message: issue.message,
    componentId: issue.componentId,
  }));

  let groundNodeId = groundHoles[0] ? holeToNodeId[groundHoles[0]] : undefined;
  if (!groundNodeId) {
    const source = project.components.find((component) => component.kind === 'voltage-source');
    groundNodeId = source
      ? holeToNodeId[source.terminalHoleIds.negative]
      : project.signalGenerator.referenceHoleId
        ? holeToNodeId[project.signalGenerator.referenceHoleId]
      : (holeToNodeId[board.holes[0].id] ?? 'node-ground');
    warnings.push({
      code: 'IMPLICIT_GROUND',
      message: 'No ground terminal was placed; the first source negative terminal is used as reference.',
    });
  }

  const componentTerminalNodes: Record<string, Record<string, string>> = {};
  const electricalComponents: ElectricalComponent[] = [];

  for (const component of project.components) {
    componentTerminalNodes[component.id] = Object.fromEntries(
      terminalEntries(component).map(([terminal, holeId]) => [terminal, holeToNodeId[holeId]]),
    );

    switch (component.kind) {
      case 'resistor':
        if (component.resistanceOhms <= 0) {
          errors.push({
            code: 'INVALID_RESISTANCE',
            message: `${component.label} must have resistance greater than zero.`,
            componentId: component.id,
          });
        } else {
          electricalComponents.push({
            id: component.id,
            kind: 'resistor',
            positiveNodeId: holeToNodeId[component.terminalHoleIds.a],
            negativeNodeId: holeToNodeId[component.terminalHoleIds.b],
            resistanceOhms: component.resistanceOhms,
          });
        }
        break;
      case 'led':
        electricalComponents.push({
          id: component.id,
          kind: 'led',
          positiveNodeId: holeToNodeId[component.terminalHoleIds.anode],
          negativeNodeId: holeToNodeId[component.terminalHoleIds.cathode],
          forwardVoltageV: component.forwardVoltageV,
          onResistanceOhms: component.onResistanceOhms,
        });
        break;
      case 'capacitor':
        if (component.capacitanceFarads <= 0) {
          errors.push({
            code: 'INVALID_CAPACITANCE',
            message: `${component.label} must have capacitance greater than zero.`,
            componentId: component.id,
          });
        } else {
          electricalComponents.push({
            id: component.id,
            kind: 'capacitor',
            positiveNodeId: holeToNodeId[component.terminalHoleIds.positive],
            negativeNodeId: holeToNodeId[component.terminalHoleIds.negative],
            capacitanceFarads: component.capacitanceFarads,
          });
        }
        break;
      case 'voltage-source':
        electricalComponents.push({
          id: component.id,
          kind: 'voltage-source',
          positiveNodeId: holeToNodeId[component.terminalHoleIds.positive],
          negativeNodeId: holeToNodeId[component.terminalHoleIds.negative],
          voltageV: project.powerOn ? component.voltageV : 0,
        });
        break;
      case 'ne555':
        electricalComponents.push(createNe555Subcircuit(component.id, {
          gnd: holeToNodeId[component.terminalHoleIds.pin1],
          trigger: holeToNodeId[component.terminalHoleIds.pin2],
          output: holeToNodeId[component.terminalHoleIds.pin3],
          reset: holeToNodeId[component.terminalHoleIds.pin4],
          control: holeToNodeId[component.terminalHoleIds.pin5],
          threshold: holeToNodeId[component.terminalHoleIds.pin6],
          discharge: holeToNodeId[component.terminalHoleIds.pin7],
          vcc: holeToNodeId[component.terminalHoleIds.pin8],
        }));
        break;
      case 'tmp36': {
        const output = tmp36Output(component.temperatureC, project.powerOn ? 5 : 0);
        electricalComponents.push({
          id: component.id,
          kind: 'voltage-source',
          positiveNodeId: holeToNodeId[component.terminalHoleIds.vout],
          negativeNodeId: holeToNodeId[component.terminalHoleIds.gnd],
          voltageV: output.outputVoltageV,
        });
        if (!output.validSupply) warnings.push({
          code: 'TMP36_SUPPLY_RANGE',
          message: `${component.label} requires a 2.7–5.5 V supply; its output is disabled while workbench power is off.`,
          componentId: component.id,
        });
        break;
      }
      case 'ground':
      case 'switch':
      case 'jumper-wire':
        break;
    }
  }


  const generator = project.signalGenerator;
  if (generator.enabled) {
    if (generator.outputHoleId && generator.referenceHoleId) {
      const positiveNodeId = holeToNodeId[generator.outputHoleId];
      const negativeNodeId = holeToNodeId[generator.referenceHoleId];
      componentTerminalNodes[SIGNAL_GENERATOR_COMPONENT_ID] = {
        output: positiveNodeId,
        reference: negativeNodeId,
      };
      electricalComponents.push({
        id: SIGNAL_GENERATOR_COMPONENT_ID,
        kind: 'signal-source',
        positiveNodeId,
        negativeNodeId,
        waveform: generator.waveform,
        frequencyHz: generator.frequencyHz,
        amplitudeVpp: generator.amplitudeVpp,
        offsetV: generator.offsetV,
      });
    } else {
      warnings.push({
        code: 'DISCONNECTED_SIGNAL_GENERATOR',
        message: 'Connect both signal-generator leads before enabling its output.',
        componentId: SIGNAL_GENERATOR_COMPONENT_ID,
      });
    }
  }

  return {
    circuit: {
      nodes: roots.map((root) => ({ id: nodeIdByRoot.get(root)! })),
      groundNodeId,
      components: electricalComponents,
    },
    holeToNodeId,
    componentTerminalNodes,
    warnings,
    errors,
  };
}
