import type {
  Circuit,
  ElectricalComponent,
  ElectricalSignalSource,
  SimulationMessage,
  SimulationResult,
} from '../domain/circuit/types';
import { electricalComponentNodeIds, signalSourceVoltageAtTime } from '../domain/circuit/types';

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

export interface LinearizedDevice {
  nodeIds: string[];
  voltagesAtGuessV: number[];
  currentsAtGuessA: number[];
  /** Jacobian[row current terminal][column voltage terminal], in siemens. */
  jacobianSiemens: number[][];
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

function stampLinearizedDevice(
  matrix: number[][],
  rhs: number[],
  nodeIndex: Map<string, number>,
  groundNodeId: string,
  device: LinearizedDevice,
): void {
  for (let row = 0; row < device.nodeIds.length; row += 1) {
    const rowIndex = device.nodeIds[row] === groundNodeId
      ? undefined
      : nodeIndex.get(device.nodeIds[row]);
    if (rowIndex === undefined) continue;
    let equivalentRhsA = -device.currentsAtGuessA[row];
    for (let column = 0; column < device.nodeIds.length; column += 1) {
      const conductance = device.jacobianSiemens[row][column];
      equivalentRhsA += conductance * device.voltagesAtGuessV[column];
      const columnIndex = device.nodeIds[column] === groundNodeId
        ? undefined
        : nodeIndex.get(device.nodeIds[column]);
      if (columnIndex !== undefined) matrix[rowIndex][columnIndex] += conductance;
    }
    rhs[rowIndex] += equivalentRhsA;
  }
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
  timeSeconds = 0,
  linearizedDevices: readonly LinearizedDevice[] = [],
): LinearSolution | undefined {
  const activeNodeIds = new Set<string>([circuit.groundNodeId]);
  for (const component of circuit.components) {
    for (const nodeId of electricalComponentNodeIds(component)) activeNodeIds.add(nodeId);
  }
  for (const branch of companionBranches) {
    activeNodeIds.add(branch.positiveNodeId);
    activeNodeIds.add(branch.negativeNodeId);
  }
  for (const device of linearizedDevices) {
    for (const nodeId of device.nodeIds) activeNodeIds.add(nodeId);
  }
  const nonGroundNodes = circuit.nodes.filter(
    (node) => node.id !== circuit.groundNodeId && activeNodeIds.has(node.id),
  );
  const sources = circuit.components.filter(
    (component) => (component.kind === 'voltage-source' || component.kind === 'signal-source')
      && (
        component.positiveNodeId !== component.negativeNodeId
        || sourceVoltageAtTime(component, timeSeconds) !== 0
      ),
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
    } else if (component.kind === 'voltage-source' || component.kind === 'signal-source') {
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
      rhs[sourceEquation] = sourceVoltageAtTime(component, timeSeconds);
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

  for (const device of linearizedDevices) {
    stampLinearizedDevice(matrix, rhs, nodeIndex, circuit.groundNodeId, device);
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
  if (component.kind === 'bjt') {
    return voltageAt(solution, groundNodeId, component.collectorNodeId)
      - voltageAt(solution, groundNodeId, component.emitterNodeId);
  }
  if (component.kind === 'subcircuit') return 0;
  if (component.kind === 'smooth-transconductance') {
    return voltageAt(solution, groundNodeId, component.outputPositiveNodeId)
      - voltageAt(solution, groundNodeId, component.outputNegativeNodeId);
  }
  return voltageAt(solution, groundNodeId, component.positiveNodeId)
    - voltageAt(solution, groundNodeId, component.negativeNodeId);
}

function sourceVoltageAtTime(
  source: Extract<ElectricalComponent, { kind: 'voltage-source' }> | ElectricalSignalSource,
  timeSeconds: number,
): number {
  return source.kind === 'voltage-source'
    ? source.voltageV
    : signalSourceVoltageAtTime(source, timeSeconds);
}

export function directShortErrors(circuit: Circuit, timeSeconds = 0): SimulationMessage[] {
  return circuit.components
    .filter(
      (component) => (component.kind === 'voltage-source' || component.kind === 'signal-source')
        && component.positiveNodeId === component.negativeNodeId
        && sourceVoltageAtTime(component, timeSeconds) !== 0,
    )
    .map((component) => ({
      code: 'DIRECT_SHORT',
      message: `Voltage source ${component.id} is directly shorted.`,
      componentId: component.id,
    }));
}
