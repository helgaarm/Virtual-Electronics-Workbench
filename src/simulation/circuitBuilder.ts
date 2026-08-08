import type { Circuit, ElectricalComponent, SimulationMessage } from '../domain/circuit/types';
import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import type { WorkbenchProject } from '../domain/project';
import { createBreadboardDefinition } from '../domain/physical/breadboard';
import { validateOccupancy } from '../domain/physical/occupancy';
import { UnionFind } from './unionFind';

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
      case 'voltage-source':
        if (project.powerOn) {
          electricalComponents.push({
            id: component.id,
            kind: 'voltage-source',
            positiveNodeId: holeToNodeId[component.terminalHoleIds.positive],
            negativeNodeId: holeToNodeId[component.terminalHoleIds.negative],
            voltageV: component.voltageV,
          });
        }
        break;
      case 'ground':
      case 'switch':
      case 'jumper-wire':
        break;
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
