import type { Circuit, ElectricalLed, SimulationResult } from '../../domain/circuit/types';
import {
  componentVoltage,
  directShortErrors,
  emptySimulationResult,
  solveLinearCircuit,
  voltageAt,
  type LinearSolution,
} from '../mna';

const MAX_LED_ITERATIONS = 12;

export function solveDC(circuit: Circuit): SimulationResult {
  const errors = directShortErrors(circuit);
  if (errors.length > 0) return emptySimulationResult(errors);

  const leds = circuit.components.filter(
    (component): component is ElectricalLed => component.kind === 'led',
  );
  const ledStates = new Map(leds.map((led) => [led.id, false]));
  let solution: LinearSolution | undefined;
  let iterations: number;

  for (iterations = 1; iterations <= MAX_LED_ITERATIONS; iterations += 1) {
    solution = solveLinearCircuit(circuit, ledStates);
    if (!solution) {
      return emptySimulationResult([
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

  if (!solution) {
    return emptySimulationResult([{ code: 'NO_SOLUTION', message: 'No solution was produced.' }]);
  }

  const nodeVoltages: Record<string, number> = { [circuit.groundNodeId]: 0 };
  for (const node of circuit.nodes) {
    nodeVoltages[node.id] = voltageAt(solution, circuit.groundNodeId, node.id);
  }

  const componentCurrents: Record<string, number> = {};
  const componentPowers: Record<string, number> = {};
  for (const component of circuit.components) {
    const voltage = componentVoltage(solution, circuit.groundNodeId, component);
    let current: number;
    if (component.kind === 'resistor') current = voltage / component.resistanceOhms;
    else if (component.kind === 'led') {
      current = ledStates.get(component.id)
        ? Math.max(0, (voltage - component.forwardVoltageV) / component.onResistanceOhms)
        : 0;
    } else if (component.kind === 'capacitor') current = 0;
    else current = solution.values[solution.sourceIndex.get(component.id)!] ?? 0;
    componentCurrents[component.id] = current;
    componentPowers[component.id] = voltage * current;
  }

  const warnings = leds.length
    ? [{ code: 'SIMPLIFIED_LED_MODEL', message: 'LEDs use a piecewise-linear educational model.' }]
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
