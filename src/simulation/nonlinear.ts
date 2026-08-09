import type {
  Circuit,
  ElectricalBjt,
  ElectricalDiode,
  ElectricalSmoothTransconductance,
  ElectricalSmoothSwitch,
  SimulationMessage,
} from '../domain/circuit/types';
import { signalSourceVoltageAtTime } from '../domain/circuit/types';
import {
  solveLinearCircuit,
  voltageAt,
  type CompanionBranch,
  type LinearizedDevice,
  type LinearSolution,
} from './mna';

const BOLTZMANN_CONSTANT_J_PER_K = 1.380649e-23;
const ELEMENTARY_CHARGE_C = 1.602176634e-19;
// Linear continuation at about 0.69 V (n=1, 298 K) prevents an ideal junction
// from creating unrealistically huge matrix conductances before package series
// resistance is modelled explicitly by a device subcircuit.
const MAX_EXPONENT = 27;
const MAX_ITERATIONS = 500;
const MAX_JUNCTION_VOLTAGE_STEP_V = 0.1;
const ABSOLUTE_VOLTAGE_TOLERANCE_V = 1e-3;
const RELATIVE_VOLTAGE_TOLERANCE = 1e-6;
const ABSOLUTE_CURRENT_RESIDUAL_A = 5e-9;
const RELATIVE_CURRENT_RESIDUAL = 1e-4;

export type NonlinearComponent = ElectricalDiode | ElectricalBjt | ElectricalSmoothTransconductance | ElectricalSmoothSwitch;

export interface NonlinearDiagnostics {
  nonlinearIterations: number;
  maximumVoltageDeltaV: number;
  maximumCurrentResidualA: number;
}

export type NonlinearSolveOutcome =
  | { status: 'ok'; solution: LinearSolution; diagnostics: NonlinearDiagnostics }
  | { status: 'error'; errors: SimulationMessage[]; diagnostics: NonlinearDiagnostics };

interface JunctionEvaluation {
  currentA: number;
  conductanceSiemens: number;
}

function thermalVoltageV(temperatureK: number): number {
  return BOLTZMANN_CONSTANT_J_PER_K * temperatureK / ELEMENTARY_CHARGE_C;
}

/** Shockley junction with a linear continuation beyond the exponential limit. */
function junction(
  voltageV: number,
  saturationCurrentA: number,
  emissionCoefficient: number,
  temperatureK: number,
): JunctionEvaluation {
  const scaledThermalVoltageV = emissionCoefficient * thermalVoltageV(temperatureK);
  const exponent = voltageV / scaledThermalVoltageV;
  if (exponent > MAX_EXPONENT) {
    const boundaryExponential = Math.exp(MAX_EXPONENT);
    return {
      currentA: saturationCurrentA
        * (boundaryExponential * (1 + exponent - MAX_EXPONENT) - 1),
      conductanceSiemens: saturationCurrentA * boundaryExponential / scaledThermalVoltageV,
    };
  }
  const boundedExponent = Math.max(-MAX_EXPONENT, exponent);
  const exponential = Math.exp(boundedExponent);
  return {
    currentA: saturationCurrentA * Math.expm1(boundedExponent),
    conductanceSiemens: saturationCurrentA * exponential / scaledThermalVoltageV,
  };
}

function nodeVoltage(nodeVoltages: Readonly<Record<string, number>>, nodeId: string): number {
  return nodeVoltages[nodeId] ?? 0;
}

export function evaluateNonlinearDevice(
  component: NonlinearComponent,
  nodeVoltages: Readonly<Record<string, number>>,
): LinearizedDevice {
  if (component.kind === 'smooth-switch') {
    const positiveV = nodeVoltage(nodeVoltages, component.positiveNodeId);
    const negativeV = nodeVoltage(nodeVoltages, component.negativeNodeId);
    const controlPositiveV = nodeVoltage(nodeVoltages, component.controlPositiveNodeId);
    const controlNegativeV = nodeVoltage(nodeVoltages, component.controlNegativeNodeId);
    const normalizedControl = Math.max(
      -20,
      Math.min(20, (controlPositiveV - controlNegativeV) / component.transitionVoltageV),
    );
    const hyperbolic = Math.tanh(normalizedControl);
    const fraction = (1 + hyperbolic) / 2;
    const fractionDerivative = (1 - hyperbolic * hyperbolic)
      / (2 * component.transitionVoltageV);
    const conductance = fraction / component.onResistanceOhms;
    const outputVoltageV = positiveV - negativeV;
    const currentA = conductance * outputVoltageV;
    const controlTransconductance = outputVoltageV * fractionDerivative
      / component.onResistanceOhms;
    return {
      nodeIds: [
        component.positiveNodeId,
        component.negativeNodeId,
        component.controlPositiveNodeId,
        component.controlNegativeNodeId,
      ],
      voltagesAtGuessV: [positiveV, negativeV, controlPositiveV, controlNegativeV],
      currentsAtGuessA: [currentA, -currentA, 0, 0],
      jacobianSiemens: [
        [conductance, -conductance, controlTransconductance, -controlTransconductance],
        [-conductance, conductance, -controlTransconductance, controlTransconductance],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    };
  }
  if (component.kind === 'smooth-transconductance') {
    const outputPositiveV = nodeVoltage(nodeVoltages, component.outputPositiveNodeId);
    const outputNegativeV = nodeVoltage(nodeVoltages, component.outputNegativeNodeId);
    const controlPositiveV = nodeVoltage(nodeVoltages, component.controlPositiveNodeId);
    const controlNegativeV = nodeVoltage(nodeVoltages, component.controlNegativeNodeId);
    const normalizedControl = Math.max(
      -20,
      Math.min(20, (controlPositiveV - controlNegativeV) / component.transitionVoltageV),
    );
    const hyperbolic = Math.tanh(normalizedControl);
    const currentA = component.maximumCurrentA * (1 + hyperbolic) / 2;
    const transconductance = component.maximumCurrentA
      * (1 - hyperbolic * hyperbolic) / (2 * component.transitionVoltageV);
    return {
      nodeIds: [
        component.outputPositiveNodeId,
        component.outputNegativeNodeId,
        component.controlPositiveNodeId,
        component.controlNegativeNodeId,
      ],
      voltagesAtGuessV: [outputPositiveV, outputNegativeV, controlPositiveV, controlNegativeV],
      currentsAtGuessA: [currentA, -currentA, 0, 0],
      jacobianSiemens: [
        [0, 0, transconductance, -transconductance],
        [0, 0, -transconductance, transconductance],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    };
  }
  if (component.kind === 'diode') {
    const positiveV = nodeVoltage(nodeVoltages, component.positiveNodeId);
    const negativeV = nodeVoltage(nodeVoltages, component.negativeNodeId);
    const evaluated = junction(
      positiveV - negativeV,
      component.model.saturationCurrentA,
      component.model.emissionCoefficient,
      component.model.temperatureK,
    );
    return {
      nodeIds: [component.positiveNodeId, component.negativeNodeId],
      voltagesAtGuessV: [positiveV, negativeV],
      currentsAtGuessA: [evaluated.currentA, -evaluated.currentA],
      jacobianSiemens: [
        [evaluated.conductanceSiemens, -evaluated.conductanceSiemens],
        [-evaluated.conductanceSiemens, evaluated.conductanceSiemens],
      ],
    };
  }

  const collectorV = nodeVoltage(nodeVoltages, component.collectorNodeId);
  const baseV = nodeVoltage(nodeVoltages, component.baseNodeId);
  const emitterV = nodeVoltage(nodeVoltages, component.emitterNodeId);
  const orientation = component.polarity === 'npn' ? 1 : -1;
  const baseEmitter = junction(
    orientation * (baseV - emitterV),
    component.model.saturationCurrentA,
    component.model.emissionCoefficient,
    component.model.temperatureK,
  );
  const baseCollector = junction(
    orientation * (baseV - collectorV),
    component.model.saturationCurrentA,
    component.model.emissionCoefficient,
    component.model.temperatureK,
  );
  const alphaForward = component.model.forwardBeta / (component.model.forwardBeta + 1);
  const alphaReverse = component.model.reverseBeta / (component.model.reverseBeta + 1);
  const collectorCurrentA = orientation
    * (alphaForward * baseEmitter.currentA - baseCollector.currentA);
  const emitterCurrentA = orientation
    * (-baseEmitter.currentA + alphaReverse * baseCollector.currentA);
  const baseCurrentA = -(collectorCurrentA + emitterCurrentA);
  const gbe = baseEmitter.conductanceSiemens;
  const gbc = baseCollector.conductanceSiemens;

  return {
    nodeIds: [component.collectorNodeId, component.baseNodeId, component.emitterNodeId],
    voltagesAtGuessV: [collectorV, baseV, emitterV],
    currentsAtGuessA: [collectorCurrentA, baseCurrentA, emitterCurrentA],
    jacobianSiemens: [
      [gbc, alphaForward * gbe - gbc, -alphaForward * gbe],
      [-(1 - alphaReverse) * gbc,
        (1 - alphaForward) * gbe + (1 - alphaReverse) * gbc,
        -(1 - alphaForward) * gbe],
      [-alphaReverse * gbc, -gbe + alphaReverse * gbc, gbe],
    ],
  };
}

function invalidDeviceMessage(component: NonlinearComponent): SimulationMessage | undefined {
  if (component.kind === 'smooth-switch') {
    if (![component.onResistanceOhms, component.transitionVoltageV]
      .every((value) => Number.isFinite(value) && value > 0)) {
      return {
        code: 'INVALID_SEMICONDUCTOR_PARAMETERS',
        message: `Smooth switch ${component.id} has invalid parameters.`,
        componentId: component.id,
      };
    }
    return undefined;
  }
  if (component.kind === 'smooth-transconductance') {
    if (![component.maximumCurrentA, component.transitionVoltageV]
      .every((value) => Number.isFinite(value) && value > 0)) {
      return {
        code: 'INVALID_SEMICONDUCTOR_PARAMETERS',
        message: `Transconductance stage ${component.id} has invalid parameters.`,
        componentId: component.id,
      };
    }
    return undefined;
  }
  const { saturationCurrentA, emissionCoefficient, temperatureK } = component.model;
  if (![saturationCurrentA, emissionCoefficient, temperatureK]
    .every((value) => Number.isFinite(value) && value > 0)) {
    return {
      code: 'INVALID_SEMICONDUCTOR_PARAMETERS',
      message: `Semiconductor ${component.id} has invalid junction parameters.`,
      componentId: component.id,
    };
  }
  if (component.kind === 'bjt'
    && ![component.model.forwardBeta, component.model.reverseBeta]
      .every((value) => Number.isFinite(value) && value > 0)) {
    return {
      code: 'INVALID_SEMICONDUCTOR_PARAMETERS',
      message: `Transistor ${component.id} must have positive current gains.`,
      componentId: component.id,
    };
  }
  return undefined;
}

function solutionNodeVoltages(circuit: Circuit, solution: LinearSolution): Record<string, number> {
  return Object.fromEntries(circuit.nodes.map((node) => [
    node.id,
    voltageAt(solution, circuit.groundNodeId, node.id),
  ]));
}

interface CircuitResidual {
  maximumCurrentResidualA: number;
  currentScaleA: number;
  maximumVoltageConstraintResidualV: number;
}

/** Evaluates the actual nonlinear circuit equations, not merely the error
 * against the previous tangent. This makes damped Newton backtracking choose
 * progress toward Kirchhoff balance instead of always preferring tiny steps. */
function circuitResidual(
  circuit: Circuit,
  ledStates: ReadonlyMap<string, boolean>,
  companionBranches: readonly CompanionBranch[],
  timeSeconds: number,
  voltages: Readonly<Record<string, number>>,
  sourceCurrents: Readonly<Record<string, number>>,
): CircuitResidual {
  const nodeResidualsA: Record<string, number> = Object.fromEntries(
    circuit.nodes.map((node) => [node.id, 0]),
  );
  let currentScaleA = 0;
  let maximumVoltageConstraintResidualV = 0;
  const addTerminalCurrent = (nodeId: string, currentLeavingA: number) => {
    if (nodeId !== circuit.groundNodeId) {
      nodeResidualsA[nodeId] = (nodeResidualsA[nodeId] ?? 0) + currentLeavingA;
    }
    currentScaleA = Math.max(currentScaleA, Math.abs(currentLeavingA));
  };
  const addBranchCurrent = (positiveNodeId: string, negativeNodeId: string, currentA: number) => {
    addTerminalCurrent(positiveNodeId, currentA);
    addTerminalCurrent(negativeNodeId, -currentA);
  };

  for (const node of circuit.nodes) {
    if (node.id !== circuit.groundNodeId) addTerminalCurrent(node.id, nodeVoltage(voltages, node.id) * 1e-12);
  }
  for (const component of circuit.components) {
    if (component.kind === 'resistor') {
      addBranchCurrent(
        component.positiveNodeId,
        component.negativeNodeId,
        (nodeVoltage(voltages, component.positiveNodeId)
          - nodeVoltage(voltages, component.negativeNodeId)) / component.resistanceOhms,
      );
    } else if (component.kind === 'led' && ledStates.get(component.id)) {
      addBranchCurrent(
        component.positiveNodeId,
        component.negativeNodeId,
        (nodeVoltage(voltages, component.positiveNodeId)
          - nodeVoltage(voltages, component.negativeNodeId)
          - component.forwardVoltageV) / component.onResistanceOhms,
      );
    } else if (component.kind === 'voltage-source' || component.kind === 'signal-source') {
      addBranchCurrent(
        component.positiveNodeId,
        component.negativeNodeId,
        sourceCurrents[component.id] ?? 0,
      );
      const sourceVoltageV = component.kind === 'voltage-source'
        ? component.voltageV
        : signalSourceVoltageAtTime(component, timeSeconds);
      maximumVoltageConstraintResidualV = Math.max(
        maximumVoltageConstraintResidualV,
        Math.abs(
          nodeVoltage(voltages, component.positiveNodeId)
            - nodeVoltage(voltages, component.negativeNodeId)
            - sourceVoltageV,
        ),
      );
    } else if (component.kind === 'diode'
      || component.kind === 'bjt'
      || component.kind === 'smooth-transconductance'
      || component.kind === 'smooth-switch') {
      const evaluated = evaluateNonlinearDevice(component, voltages);
      evaluated.nodeIds.forEach((nodeId, index) => {
        addTerminalCurrent(nodeId, evaluated.currentsAtGuessA[index]);
      });
    }
  }
  for (const branch of companionBranches) {
    addBranchCurrent(
      branch.positiveNodeId,
      branch.negativeNodeId,
      branch.conductanceSiemens
        * (nodeVoltage(voltages, branch.positiveNodeId)
          - nodeVoltage(voltages, branch.negativeNodeId))
        + branch.currentPositiveToNegativeA,
    );
  }
  return {
    maximumCurrentResidualA: Math.max(0, ...Object.values(nodeResidualsA).map(Math.abs)),
    currentScaleA,
    maximumVoltageConstraintResidualV,
  };
}

function limitVoltageDifference(
  voltages: Record<string, number>,
  previous: Readonly<Record<string, number>>,
  firstNodeId: string,
  secondNodeId: string,
  groundNodeId: string,
  fixedNodeIds: ReadonlySet<string>,
): void {
  const previousDifference = nodeVoltage(previous, firstNodeId) - nodeVoltage(previous, secondNodeId);
  const proposedDifference = nodeVoltage(voltages, firstNodeId) - nodeVoltage(voltages, secondNodeId);
  const proposedDeltaV = proposedDifference - previousDifference;
  const limitedDifference = previousDifference + Math.max(
    -MAX_JUNCTION_VOLTAGE_STEP_V,
    Math.min(MAX_JUNCTION_VOLTAGE_STEP_V, proposedDeltaV),
  );
  const correctionV = limitedDifference - proposedDifference;
  const firstFixed = fixedNodeIds.has(firstNodeId);
  const secondFixed = fixedNodeIds.has(secondNodeId);
  if (firstFixed && secondFixed) return;
  if (firstFixed) {
    voltages[secondNodeId] = nodeVoltage(voltages, firstNodeId) - limitedDifference;
  } else if (secondFixed) {
    voltages[firstNodeId] = nodeVoltage(voltages, secondNodeId) + limitedDifference;
  } else if (firstNodeId !== groundNodeId && secondNodeId !== groundNodeId) {
    voltages[firstNodeId] = nodeVoltage(voltages, firstNodeId) + correctionV / 2;
    voltages[secondNodeId] = nodeVoltage(voltages, secondNodeId) - correctionV / 2;
  } else if (firstNodeId !== groundNodeId) {
    voltages[firstNodeId] = nodeVoltage(voltages, firstNodeId) + correctionV;
  } else if (secondNodeId !== groundNodeId) {
    voltages[secondNodeId] = nodeVoltage(voltages, secondNodeId) - correctionV;
  }
}

function limitJunctionVoltages(
  devices: readonly NonlinearComponent[],
  voltages: Record<string, number>,
  previous: Readonly<Record<string, number>>,
  groundNodeId: string,
  fixedNodeIds: ReadonlySet<string>,
): void {
  // Two passes keep both BJT junctions bounded after their shared base node is adjusted.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const device of devices) {
      if (device.kind === 'diode') {
        limitVoltageDifference(
          voltages,
          previous,
          device.positiveNodeId,
          device.negativeNodeId,
          groundNodeId,
          fixedNodeIds,
        );
      } else if (device.kind === 'bjt') {
        limitVoltageDifference(
          voltages,
          previous,
          device.baseNodeId,
          device.emitterNodeId,
          groundNodeId,
          fixedNodeIds,
        );
        limitVoltageDifference(
          voltages,
          previous,
          device.baseNodeId,
          device.collectorNodeId,
          groundNodeId,
          fixedNodeIds,
        );
      }
    }
  }
  voltages[groundNodeId] = 0;
}

export function solveNonlinearCircuit(
  circuit: Circuit,
  ledStates: ReadonlyMap<string, boolean>,
  companionBranches: readonly CompanionBranch[] = [],
  timeSeconds = 0,
  initialNodeVoltages: Readonly<Record<string, number>> = {},
): NonlinearSolveOutcome {
  const devices = circuit.components.filter(
    (component): component is NonlinearComponent => component.kind === 'diode'
      || component.kind === 'bjt'
      || component.kind === 'smooth-transconductance'
      || component.kind === 'smooth-switch',
  );
  const invalid = devices.map(invalidDeviceMessage).find((message) => message !== undefined);
  const initialDiagnostics: NonlinearDiagnostics = {
    nonlinearIterations: 0,
    maximumVoltageDeltaV: 0,
    maximumCurrentResidualA: 0,
  };
  if (invalid) return { status: 'error', errors: [invalid], diagnostics: initialDiagnostics };
  if (devices.length === 0) {
    const solution = solveLinearCircuit(circuit, ledStates, companionBranches, timeSeconds);
    return solution
      ? { status: 'ok', solution, diagnostics: initialDiagnostics }
      : {
        status: 'error',
        errors: [{ code: 'SINGULAR_CIRCUIT', message: 'The circuit matrix could not be solved.' }],
        diagnostics: initialDiagnostics,
      };
  }

  let guess: Record<string, number> = Object.fromEntries(
    circuit.nodes.map((node) => [node.id, initialNodeVoltages[node.id] ?? 0]),
  );
  guess[circuit.groundNodeId] = 0;
  const fixedNodeIds = new Set<string>([circuit.groundNodeId]);
  for (const source of circuit.components) {
    if (source.kind !== 'voltage-source' && source.kind !== 'signal-source') continue;
    const voltageV = source.kind === 'voltage-source'
      ? source.voltageV
      : signalSourceVoltageAtTime(source, timeSeconds);
    if (source.negativeNodeId === circuit.groundNodeId) {
      guess[source.positiveNodeId] = voltageV;
      fixedNodeIds.add(source.positiveNodeId);
    } else if (source.positiveNodeId === circuit.groundNodeId) {
      guess[source.negativeNodeId] = -voltageV;
      fixedNodeIds.add(source.negativeNodeId);
    }
  }
  let latestDiagnostics = initialDiagnostics;
  let sourceCurrents: Record<string, number> = {};
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const linearizedDevices = devices.map((device) => evaluateNonlinearDevice(device, guess));
    const solution = solveLinearCircuit(
      circuit,
      ledStates,
      companionBranches,
      timeSeconds,
      linearizedDevices,
    );
    if (!solution) {
      return {
        status: 'error',
        errors: [{ code: 'SINGULAR_CIRCUIT', message: 'The nonlinear circuit matrix could not be solved.' }],
        diagnostics: { ...latestDiagnostics, nonlinearIterations: iteration },
      };
    }
    const candidate = solutionNodeVoltages(circuit, solution);
    const rawMaximumDeltaV = Math.max(
      0,
      ...circuit.nodes.map((node) => Math.abs(candidate[node.id] - (guess[node.id] ?? 0))),
    );
    const candidateSourceCurrents = Object.fromEntries(
      [...solution.sourceIndex].map(([sourceId, index]) => [sourceId, solution.values[index] ?? 0]),
    );
    const candidateResidual = circuitResidual(
      circuit,
      ledStates,
      companionBranches,
      timeSeconds,
      candidate,
      candidateSourceCurrents,
    );
    const voltageScaleV = Math.max(1, ...Object.values(candidate).map(Math.abs));
    const voltageToleranceV = ABSOLUTE_VOLTAGE_TOLERANCE_V
      + RELATIVE_VOLTAGE_TOLERANCE * voltageScaleV;
    const candidateCurrentConverged = candidateResidual.maximumCurrentResidualA
      <= ABSOLUTE_CURRENT_RESIDUAL_A
        + RELATIVE_CURRENT_RESIDUAL * candidateResidual.currentScaleA;
    const candidateVoltageConstraintsConverged
      = candidateResidual.maximumVoltageConstraintResidualV <= voltageToleranceV;
    // A large Newton update can legitimately cross a switching transition. If
    // the solved candidate already satisfies the nonlinear terminal currents,
    // it is a valid root even though it is far from the preceding estimate.
    if (candidateCurrentConverged && candidateVoltageConstraintsConverged) {
      return {
        status: 'ok',
        solution,
        diagnostics: {
          nonlinearIterations: iteration,
          maximumVoltageDeltaV: rawMaximumDeltaV,
          maximumCurrentResidualA: candidateResidual.maximumCurrentResidualA,
        },
      };
    }
    // Backtrack deterministically along the Newton direction and keep the
    // junction-limited point with the smallest nonlinear linearization error.
    const dampingCandidates = devices.some((device) => device.kind === 'bjt')
      ? [1, 0.5, 0.25, 0.1, 0.05, 0.02]
      : [1];
    let nextGuess = candidate;
    let nextSourceCurrents = candidateSourceCurrents;
    let selectedResidual = candidateResidual;
    let selectedMerit = Math.max(
      candidateResidual.maximumCurrentResidualA
        / (ABSOLUTE_CURRENT_RESIDUAL_A
          + RELATIVE_CURRENT_RESIDUAL * candidateResidual.currentScaleA),
      candidateResidual.maximumVoltageConstraintResidualV / voltageToleranceV,
    );
    for (const damping of dampingCandidates) {
      const trial = Object.fromEntries(circuit.nodes.map((node) => [
        node.id,
        (guess[node.id] ?? 0) + damping * (candidate[node.id] - (guess[node.id] ?? 0)),
      ]));
      limitJunctionVoltages(devices, trial, guess, circuit.groundNodeId, fixedNodeIds);
      const trialSourceCurrents = Object.fromEntries(
        Object.keys(candidateSourceCurrents).map((sourceId) => [
          sourceId,
          (sourceCurrents[sourceId] ?? 0)
            + damping * (candidateSourceCurrents[sourceId] - (sourceCurrents[sourceId] ?? 0)),
        ]),
      );
      const trialResidual = circuitResidual(
        circuit,
        ledStates,
        companionBranches,
        timeSeconds,
        trial,
        trialSourceCurrents,
      );
      const trialVoltageScaleV = Math.max(1, ...Object.values(trial).map(Math.abs));
      const trialMerit = Math.max(
        trialResidual.maximumCurrentResidualA
          / (ABSOLUTE_CURRENT_RESIDUAL_A
            + RELATIVE_CURRENT_RESIDUAL * trialResidual.currentScaleA),
        trialResidual.maximumVoltageConstraintResidualV
          / (ABSOLUTE_VOLTAGE_TOLERANCE_V
            + RELATIVE_VOLTAGE_TOLERANCE * trialVoltageScaleV),
      );
      if (trialMerit < selectedMerit) {
        nextGuess = trial;
        nextSourceCurrents = trialSourceCurrents;
        selectedResidual = trialResidual;
        selectedMerit = trialMerit;
      }
    }
    const maximumVoltageDeltaV = Math.max(
      0,
      ...circuit.nodes.map((node) => Math.abs(nextGuess[node.id] - (guess[node.id] ?? 0))),
    );
    latestDiagnostics = {
      nonlinearIterations: iteration,
      maximumVoltageDeltaV,
      maximumCurrentResidualA: selectedResidual.maximumCurrentResidualA,
    };
    if (selectedMerit <= 1) {
      const convergedSolution: LinearSolution = { ...solution, values: [...solution.values] };
      for (const [nodeId, index] of solution.nodeIndex) {
        convergedSolution.values[index] = nextGuess[nodeId] ?? 0;
      }
      for (const [sourceId, index] of solution.sourceIndex) {
        convergedSolution.values[index] = nextSourceCurrents[sourceId] ?? 0;
      }
      return { status: 'ok', solution: convergedSolution, diagnostics: latestDiagnostics };
    }
    guess = nextGuess;
    sourceCurrents = nextSourceCurrents;
  }
  return {
    status: 'error',
    errors: [{
      code: 'NONLINEAR_CONVERGENCE_FAILURE',
      message: `The nonlinear solver did not converge after ${MAX_ITERATIONS} iterations.`,
    }],
    diagnostics: latestDiagnostics,
  };
}

export function nonlinearTerminalCurrents(
  component: NonlinearComponent,
  nodeVoltages: Readonly<Record<string, number>>,
): number[] {
  return evaluateNonlinearDevice(component, nodeVoltages).currentsAtGuessA;
}
