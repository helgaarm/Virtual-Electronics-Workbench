import type {
  Circuit,
  ElectricalComponent,
  ElectricalLed,
  SimulationMessage,
  SimulationResult,
} from '../../domain/circuit/types';

const GMIN_SIEMENS = 1e-12;
const PIVOT_EPSILON = 1e-14;
const MAX_LED_ITERATIONS = 12;

interface LinearSolution {
  values: number[];
  nodeIndex: Map<string, number>;
  sourceIndex: Map<string, number>;
}

function emptyResult(errors: SimulationMessage[], warnings: SimulationMessage[] = []): SimulationResult {
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

function solveLinear(circuit: Circuit, ledStates: Map<string, boolean>): LinearSolution | undefined {
  const nonGroundNodes = circuit.nodes.filter((node) => node.id !== circuit.groundNodeId);
  const sources = circuit.components.filter((component) => component.kind === 'voltage-source');
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
    } else {
      const sourceEquation = sourceIndex.get(component.id)!;
      const positive =
        component.positiveNodeId === circuit.groundNodeId
          ? undefined
          : nodeIndex.get(component.positiveNodeId);
      const negative =
        component.negativeNodeId === circuit.groundNodeId
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

  if (size === 0) return { values: [], nodeIndex, sourceIndex };
  const values = gaussianSolve(matrix, rhs);
  return values ? { values, nodeIndex, sourceIndex } : undefined;
}

function voltageAt(solution: LinearSolution, groundNodeId: string, nodeId: string): number {
  if (nodeId === groundNodeId) return 0;
  return solution.values[solution.nodeIndex.get(nodeId)!] ?? 0;
}

function componentVoltage(
  solution: LinearSolution,
  groundNodeId: string,
  component: ElectricalComponent,
): number {
  return (
    voltageAt(solution, groundNodeId, component.positiveNodeId) -
    voltageAt(solution, groundNodeId, component.negativeNodeId)
  );
}

function directShortErrors(circuit: Circuit): SimulationMessage[] {
  return circuit.components
    .filter(
      (component) =>
        component.kind === 'voltage-source' &&
        component.positiveNodeId === component.negativeNodeId &&
        component.voltageV !== 0,
    )
    .map((component) => ({
      code: 'DIRECT_SHORT',
      message: `Voltage source ${component.id} is directly shorted.`,
      componentId: component.id,
    }));
}

export function solveDC(circuit: Circuit): SimulationResult {
  const errors = directShortErrors(circuit);
  if (errors.length > 0) return emptyResult(errors);

  const leds = circuit.components.filter(
    (component): component is ElectricalLed => component.kind === 'led',
  );
  const ledStates = new Map(leds.map((led) => [led.id, false]));
  let solution: LinearSolution | undefined;
  let iterations: number;

  for (iterations = 1; iterations <= MAX_LED_ITERATIONS; iterations += 1) {
    solution = solveLinear(circuit, ledStates);
    if (!solution) {
      return emptyResult([
        { code: 'SINGULAR_CIRCUIT', message: 'The circuit matrix could not be solved.' },
      ]);
    }

    let changed = false;
    for (const led of leds) {
      const voltage = componentVoltage(solution, circuit.groundNodeId, led);
      const shouldConduct = voltage >= led.forwardVoltageV - 1e-9;
      if (shouldConduct !== ledStates.get(led.id)) {
        ledStates.set(led.id, shouldConduct);
        changed = true;
      }
    }
    if (!changed) break;
  }

  if (!solution) return emptyResult([{ code: 'NO_SOLUTION', message: 'No solution was produced.' }]);

  const nodeVoltages: Record<string, number> = { [circuit.groundNodeId]: 0 };
  for (const node of circuit.nodes) {
    nodeVoltages[node.id] = voltageAt(solution, circuit.groundNodeId, node.id);
  }

  const componentCurrents: Record<string, number> = {};
  const componentPowers: Record<string, number> = {};
  for (const component of circuit.components) {
    const voltage = componentVoltage(solution, circuit.groundNodeId, component);
    const current = component.kind === 'resistor'
      ? voltage / component.resistanceOhms
      : component.kind === 'led'
        ? ledStates.get(component.id)
          ? Math.max(0, (voltage - component.forwardVoltageV) / component.onResistanceOhms)
          : 0
        : solution.values[solution.sourceIndex.get(component.id)!] ?? 0;
    componentCurrents[component.id] = current;
    componentPowers[component.id] = voltage * current;
  }

  const warnings: SimulationMessage[] = leds.length
    ? [
        {
          code: 'SIMPLIFIED_LED_MODEL',
          message: 'LEDs use a piecewise-linear educational model.',
        },
      ]
    : [];

  return {
    status: warnings.length ? 'warning' : 'ok',
    nodeVoltages,
    componentCurrents,
    componentPowers,
    warnings,
    errors: [],
    iterations,
  };
}
