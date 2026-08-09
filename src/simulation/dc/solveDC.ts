import type { Circuit, ElectricalLed, SimulationResult } from '../../domain/circuit/types';
import {
  componentVoltage,
  directShortErrors,
  emptySimulationResult,
  voltageAt,
  type LinearSolution,
} from '../mna';
import { nonlinearTerminalCurrents, solveNonlinearCircuit } from '../nonlinear';
import { flattenCircuit } from '../subcircuits';

const MAX_LED_ITERATIONS = 12;

export function solveDC(circuit: Circuit): SimulationResult {
  const expandedCircuit = flattenCircuit(circuit);
  const errors = directShortErrors(expandedCircuit);
  if (errors.length > 0) return emptySimulationResult(errors);

  const leds = expandedCircuit.components.filter(
    (component): component is ElectricalLed => component.kind === 'led',
  );
  const ledStates = new Map(leds.map((led) => [led.id, false]));
  let solution: LinearSolution | undefined;
  let diagnostics: SimulationResult['diagnostics'];
  let initialNodeVoltages: Record<string, number> = {};
  let iterations: number;

  for (iterations = 1; iterations <= MAX_LED_ITERATIONS; iterations += 1) {
    const outcome = solveNonlinearCircuit(expandedCircuit, ledStates, [], 0, initialNodeVoltages);
    diagnostics = outcome.diagnostics;
    if (outcome.status === 'error') {
      const result = emptySimulationResult(outcome.errors);
      result.diagnostics = diagnostics;
      return result;
    }
    solution = outcome.solution;
    initialNodeVoltages = Object.fromEntries(expandedCircuit.nodes.map((node) => [
      node.id,
      voltageAt(solution!, expandedCircuit.groundNodeId, node.id),
    ]));
    let changed = false;
    for (const led of leds) {
      const voltage = componentVoltage(solution, expandedCircuit.groundNodeId, led);
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

  const nodeVoltages: Record<string, number> = { [expandedCircuit.groundNodeId]: 0 };
  for (const node of expandedCircuit.nodes) {
    nodeVoltages[node.id] = voltageAt(solution, expandedCircuit.groundNodeId, node.id);
  }

  const componentCurrents: Record<string, number> = {};
  const componentPowers: Record<string, number> = {};
  for (const component of expandedCircuit.components) {
    const voltage = componentVoltage(solution, expandedCircuit.groundNodeId, component);
    let current: number;
    if (component.kind === 'resistor') current = voltage / component.resistanceOhms;
    else if (component.kind === 'led') {
      current = ledStates.get(component.id)
        ? Math.max(0, (voltage - component.forwardVoltageV) / component.onResistanceOhms)
        : 0;
    } else if (component.kind === 'capacitor') current = 0;
    else if (component.kind === 'diode' || component.kind === 'bjt' || component.kind === 'smooth-transconductance' || component.kind === 'smooth-switch') {
      const currents = nonlinearTerminalCurrents(component, nodeVoltages);
      current = currents[0];
      if (component.kind === 'bjt') {
        const terminalVoltages = [
          nodeVoltages[component.collectorNodeId] ?? 0,
          nodeVoltages[component.baseNodeId] ?? 0,
          nodeVoltages[component.emitterNodeId] ?? 0,
        ];
        componentPowers[component.id] = currents.reduce(
          (sum, terminalCurrent, index) => sum + terminalCurrent * terminalVoltages[index],
          0,
        );
      }
    }
    else current = solution.values[solution.sourceIndex.get(component.id)!] ?? 0;
    componentCurrents[component.id] = current;
    componentPowers[component.id] ??= voltage * current;
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
    diagnostics,
  };
}
