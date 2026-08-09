import type {
  Circuit,
  ElectricalComponent,
  SimulationMessage,
  SimulationResult,
} from '../domain/circuit/types';

const GMIN_SIEMENS = 1e-12;
const PIVOT_EPSILON = 1e-14;

export interface CompanionBranch {
  positiveNodeId: string;
  negativeNodeId: string;
  conductanceSiemens: number;
  currentPositiveToNegativeA: number;
}

export interface LinearSolution {
  values: number[];
  nodeIndex: Map<string, number>;
  sourceIndex: Map<string, number>;
}

export function emptySimulationResult(
  errors: SimulationMessage[],
  warnings: SimulationMessage[] = [],
): SimulationResult {
  return {
    status: 'error',
    nodeVoltages: {},
    componentCurrents: {},
    componentPowers: {},
    warnings,
    errors,
    iterations: 0,
  };
}

function stampConductance(
  matrix: number[][],
  nodeIndex: Map<string, number>,
  groundNodeId: string,
  positiveNodeId: string,
  negativeNodeId: string,
  conductance: number,
): void {
  const positive = positiveNodeId === groundNodeId ? undefined : nodeIndex.get(positiveNodeId);
  const negative = negativeNodeId === groundNodeId ? undefined : nodeIndex.get(negativeNodeId);
  if (positive !== undefined) matrix[positive][positive] += conductance;
  if (negative !== undefined) matrix[negative][negative] += conductance;
  if (positive !== undefined && negative !== undefined) {
    matrix[positive][negative] -= conductance;
    matrix[negative][positive] -= conductance;
  }
}

function stampCurrentSource(
  rhs: number[],
  nodeIndex: Map<string, number>,
  groundNodeId: string,
  positiveNodeId: string,
  negativeNodeId: string,
  currentPositiveToNegative: number,
): void {
  const positive = positiveNodeId === groundNodeId ? undefined : nodeIndex.get(positiveNodeId);
  const negative = negativeNodeId === groundNodeId ? undefined : nodeIndex.get(negativeNodeId);
  if (positive !== undefined) rhs[positive] -= currentPositiveToNegative;
  if (negative !== undefined) rhs[negative] += currentPositiveToNegative;
}

function gaussianSolve(matrix: number[][], rhs: number[]): number[] | undefined {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < PIVOT_EPSILON) return undefined;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (Math.abs(factor) < PIVOT_EPSILON) continue;
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

export function solveLinearCircuit(
  circuit: Circuit,
  ledStates: ReadonlyMap<string, boolean>,
  companionBranches: readonly CompanionBranch[] = [],
): LinearSolution | undefined {
  const activeNodeIds = new Set<string>([circuit.groundNodeId]);
  for (const component of circuit.components) {
    activeNodeIds.add(component.positiveNodeId);
    activeNodeIds.add(component.negativeNodeId);
  }
  for (const branch of companionBranches) {
    activeNodeIds.add(branch.positiveNodeId);
    activeNodeIds.add(branch.negativeNodeId);
  }
  const nonGroundNodes = circuit.nodes.filter(
    (node) => node.id !== circuit.groundNodeId && activeNodeIds.has(node.id),
  );
  const sources = circuit.components.filter(
    (component) => component.kind === 'voltage-source'
      && (component.positiveNodeId !== component.negativeNodeId || component.voltageV !== 0),
  );
  const nodeIndex = new Map(nonGroundNodes.map((node, index) => [node.id, index]));
  const sourceIndex = new Map(
    sources.map((source, index) => [source.id, nonGroundNodes.length + index]),
  );
  const size = nonGroundNodes.length + sources.length;
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const rhs = Array<number>(size).fill(0);

  for (let index = 0; index < nonGroundNodes.length; index += 1) {
    matrix[index][index] += GMIN_SIEMENS;
  }

  for (const component of circuit.components) {
    if (component.kind === 'resistor') {
      stampConductance(
        matrix,
        nodeIndex,
        circuit.groundNodeId,
        component.positiveNodeId,
        component.negativeNodeId,
        1 / component.resistanceOhms,
      );
    } else if (component.kind === 'led') {
      if (ledStates.get(component.id)) {
        const conductance = 1 / component.onResistanceOhms;
        stampConductance(
          matrix,
          nodeIndex,
          circuit.groundNodeId,
          component.positiveNodeId,
          component.negativeNodeId,
          conductance,
        );
        stampCurrentSource(
          rhs,
          nodeIndex,
          circuit.groundNodeId,
          component.positiveNodeId,
          component.negativeNodeId,
          -conductance * component.forwardVoltageV,
        );
      }
    } else if (component.kind === 'voltage-source') {
      const sourceEquation = sourceIndex.get(component.id);
      if (sourceEquation === undefined) continue;
      const positive = component.positiveNodeId === circuit.groundNodeId
        ? undefined
        : nodeIndex.get(component.positiveNodeId);
      const negative = component.negativeNodeId === circuit.groundNodeId
        ? undefined
        : nodeIndex.get(component.negativeNodeId);
      if (positive !== undefined) {
        matrix[positive][sourceEquation] += 1;
        matrix[sourceEquation][positive] += 1;
      }
      if (negative !== undefined) {
        matrix[negative][sourceEquation] -= 1;
        matrix[sourceEquation][negative] -= 1;
      }
      rhs[sourceEquation] = component.voltageV;
    }
  }

  for (const branch of companionBranches) {
    stampConductance(
      matrix,
      nodeIndex,
      circuit.groundNodeId,
      branch.positiveNodeId,
      branch.negativeNodeId,
      branch.conductanceSiemens,
    );
    stampCurrentSource(
      rhs,
      nodeIndex,
      circuit.groundNodeId,
      branch.positiveNodeId,
      branch.negativeNodeId,
      branch.currentPositiveToNegativeA,
    );
  }

  if (size === 0) return { values: [], nodeIndex, sourceIndex };
  const values = gaussianSolve(matrix, rhs);
  return values ? { values, nodeIndex, sourceIndex } : undefined;
}

export function voltageAt(solution: LinearSolution, groundNodeId: string, nodeId: string): number {
  if (nodeId === groundNodeId) return 0;
  const index = solution.nodeIndex.get(nodeId);
  return index === undefined ? 0 : solution.values[index] ?? 0;
}

export function componentVoltage(
  solution: LinearSolution,
  groundNodeId: string,
  component: ElectricalComponent,
): number {
  return voltageAt(solution, groundNodeId, component.positiveNodeId)
    - voltageAt(solution, groundNodeId, component.negativeNodeId);
}

export function directShortErrors(circuit: Circuit): SimulationMessage[] {
  return circuit.components
    .filter(
      (component) => component.kind === 'voltage-source'
        && component.positiveNodeId === component.negativeNodeId
        && component.voltageV !== 0,
    )
    .map((component) => ({
      code: 'DIRECT_SHORT',
      message: `Voltage source ${component.id} is directly shorted.`,
      componentId: component.id,
    }));
}
