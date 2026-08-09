import type {
  Circuit,
  ElectricalCapacitor,
  ElectricalLed,
  SimulationResult,
  TransientFrame,
  TransientSample,
  TransientState,
} from '../../domain/circuit/types';
import {
  componentVoltage,
  directShortErrors,
  emptySimulationResult,
  solveLinearCircuit,
  voltageAt,
  type CompanionBranch,
  type LinearSolution,
} from '../mna';

const MAX_LED_ITERATIONS = 12;
const MAX_RUN_STEPS = 1_000_000;

function capacitors(circuit: Circuit): ElectricalCapacitor[] {
  return circuit.components.filter(
    (component): component is ElectricalCapacitor => component.kind === 'capacitor',
  );
}

export function createTransientState(
  circuit: Circuit,
  previous?: TransientState,
): TransientState {
  return {
    timeSeconds: previous?.timeSeconds ?? 0,
    capacitorVoltages: Object.fromEntries(
      capacitors(circuit).map((capacitor) => [
        capacitor.id,
        previous?.capacitorVoltages[capacitor.id] ?? 0,
      ]),
    ),
  };
}

function companionBranches(
  circuit: Circuit,
  state: TransientState,
  timeStepSeconds: number,
): CompanionBranch[] {
  return capacitors(circuit).map((capacitor) => {
    const conductanceSiemens = capacitor.capacitanceFarads / timeStepSeconds;
    return {
      positiveNodeId: capacitor.positiveNodeId,
      negativeNodeId: capacitor.negativeNodeId,
      conductanceSiemens,
      currentPositiveToNegativeA:
        -conductanceSiemens * (state.capacitorVoltages[capacitor.id] ?? 0),
    };
  });
}

function errorFrame(state: TransientState, result: SimulationResult): TransientFrame {
  return { state, result };
}

export function stepTransient(
  circuit: Circuit,
  state: TransientState,
  timeStepSeconds: number,
): TransientFrame {
  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) {
    return errorFrame(state, emptySimulationResult([
      { code: 'INVALID_TIME_STEP', message: 'Transient time step must be greater than zero.' },
    ]));
  }
  const invalidCapacitor = capacitors(circuit).find(
    (capacitor) => !Number.isFinite(capacitor.capacitanceFarads) || capacitor.capacitanceFarads <= 0,
  );
  if (invalidCapacitor) {
    return errorFrame(state, emptySimulationResult([{
      code: 'INVALID_CAPACITANCE',
      message: `Capacitor ${invalidCapacitor.id} must have capacitance greater than zero.`,
      componentId: invalidCapacitor.id,
    }]));
  }
  const directShorts = directShortErrors(circuit);
  if (directShorts.length > 0) return errorFrame(state, emptySimulationResult(directShorts));

  const leds = circuit.components.filter(
    (component): component is ElectricalLed => component.kind === 'led',
  );
  const ledStates = new Map(leds.map((led) => [led.id, false]));
  const branches = companionBranches(circuit, state, timeStepSeconds);
  let solution: LinearSolution | undefined;
  let iterations: number;
  for (iterations = 1; iterations <= MAX_LED_ITERATIONS; iterations += 1) {
    solution = solveLinearCircuit(circuit, ledStates, branches);
    if (!solution) {
      return errorFrame(state, emptySimulationResult([
        { code: 'SINGULAR_CIRCUIT', message: 'The transient circuit matrix could not be solved.' },
      ]));
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
  if (!solution) {
    return errorFrame(state, emptySimulationResult([
      { code: 'NO_SOLUTION', message: 'No transient solution was produced.' },
    ]));
  }

  const nodeVoltages: Record<string, number> = { [circuit.groundNodeId]: 0 };
  for (const node of circuit.nodes) {
    nodeVoltages[node.id] = voltageAt(solution, circuit.groundNodeId, node.id);
  }
  const componentCurrents: Record<string, number> = {};
  const componentPowers: Record<string, number> = {};
  const nextCapacitorVoltages: Record<string, number> = {};
  for (const component of circuit.components) {
    const voltage = componentVoltage(solution, circuit.groundNodeId, component);
    let current: number;
    if (component.kind === 'resistor') current = voltage / component.resistanceOhms;
    else if (component.kind === 'led') {
      current = ledStates.get(component.id)
        ? Math.max(0, (voltage - component.forwardVoltageV) / component.onResistanceOhms)
        : 0;
    } else if (component.kind === 'capacitor') {
      current = component.capacitanceFarads / timeStepSeconds
        * (voltage - (state.capacitorVoltages[component.id] ?? 0));
      nextCapacitorVoltages[component.id] = voltage;
    } else current = solution.values[solution.sourceIndex.get(component.id)!] ?? 0;
    componentCurrents[component.id] = current;
    componentPowers[component.id] = voltage * current;
  }
  const warnings = leds.length
    ? [{ code: 'SIMPLIFIED_LED_MODEL', message: 'LEDs use a piecewise-linear educational model.' }]
    : [];
  const result: SimulationResult = {
    status: warnings.length ? 'warning' : 'ok',
    nodeVoltages,
    componentCurrents,
    componentPowers,
    warnings,
    errors: [],
    iterations,
  };
  return {
    state: {
      timeSeconds: state.timeSeconds + timeStepSeconds,
      capacitorVoltages: nextCapacitorVoltages,
    },
    result,
  };
}

export interface TransientRunOptions {
  durationSeconds: number;
  timeStepSeconds: number;
  initialState?: TransientState;
}

export interface TransientRun {
  state: TransientState;
  result: SimulationResult;
  samples: TransientSample[];
}

export function runTransient(circuit: Circuit, options: TransientRunOptions): TransientRun {
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    throw new Error('Transient duration must be a finite positive number.');
  }
  const initialState = createTransientState(circuit, options.initialState);
  if (!Number.isFinite(options.timeStepSeconds) || options.timeStepSeconds <= 0) {
    return { ...stepTransient(circuit, initialState, options.timeStepSeconds), samples: [] };
  }
  const exactStepCount = options.durationSeconds / options.timeStepSeconds;
  const nearestWholeStepCount = Math.round(exactStepCount);
  const isWholeStepCount = Math.abs(exactStepCount - nearestWholeStepCount)
    <= Number.EPSILON * Math.max(1, Math.abs(exactStepCount)) * 8;
  const stepCount = isWholeStepCount ? nearestWholeStepCount : Math.ceil(exactStepCount);
  if (!Number.isFinite(stepCount) || stepCount > MAX_RUN_STEPS) {
    throw new Error(`Transient run exceeds the ${MAX_RUN_STEPS} step safety limit.`);
  }
  let frame: TransientFrame | undefined;
  let state = initialState;
  const samples: TransientSample[] = [];
  for (let index = 0; index < stepCount; index += 1) {
    const stepSeconds = index === stepCount - 1
      ? options.durationSeconds - options.timeStepSeconds * (stepCount - 1)
      : options.timeStepSeconds;
    frame = stepTransient(circuit, state, stepSeconds);
    state = frame.state;
    if (frame.result.status === 'error') break;
    samples.push({
      timeSeconds: frame.state.timeSeconds,
      nodeVoltages: frame.result.nodeVoltages,
      componentCurrents: frame.result.componentCurrents,
    });
  }
  if (!frame) throw new Error('Transient run did not produce a frame.');
  return { ...frame, samples };
}
