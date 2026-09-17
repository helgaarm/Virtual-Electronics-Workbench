import type { Circuit, SimulationResult, TransientFrame, TransientState } from '../../domain/circuit/types';
import { ntcResistanceOhms } from '../../domain/components/windSensor';

export function thermalResistances(circuit: Circuit, state: TransientState): Circuit {
  if (!circuit.thermal) return circuit;
  const sensors = new Map(circuit.thermal.sensors.map(sensor => [sensor.id, sensor]));
  const ambient = circuit.thermal.ambientTemperatureC;
  return { ...circuit, components: circuit.components.map(part => {
    const sensor = sensors.get(part.id);
    return sensor && part.kind === 'resistor' ? { ...part, resistanceOhms: ntcResistanceOhms(state.sensorTemperaturesC?.[part.id] ?? ambient, sensor.nominalResistanceOhms, sensor.nominalTemperatureC, sensor.betaK) } : part;
  }) };
}

/** Lumped illustrative assembly, not a calibrated anemometer. Actual solved V*I supplies heat.
 * Exact exponential cooling is stable for arbitrary positive dt; held input power is an approximation.
 * State is independent of React and advances only on the shared simulation clock. */
export function advanceThermal(circuit: Circuit, previous: TransientState, result: SimulationResult, dt: number): Record<string, number> | undefined {
  if (!circuit.thermal) return undefined;
  const { sensors, ambientTemperatureC, windSpeedMps } = circuit.thermal;
  const heaterIds = new Set(circuit.thermal.heaters.map(heater => heater.id));
  return Object.fromEntries(sensors.map(sensor => {
    const coupled = Boolean(sensor.heaterId);
    const conductanceWPerK = (coupled ? 0.006 : 0.007) + 0.004 * Math.sqrt(Math.max(0, windSpeedMps));
    const heatCapacityJPerK = coupled ? 0.08 : 0.105;
    const heaterW = sensor.heaterId && heaterIds.has(sensor.heaterId) ? Math.max(0, result.componentPowers[sensor.heaterId] ?? 0) * 0.85 : 0;
    const selfW = Math.max(0, result.componentPowers[sensor.id] ?? 0);
    const equilibriumC = ambientTemperatureC + (heaterW + selfW) / conductanceWPerK;
    const oldC = previous.sensorTemperaturesC?.[sensor.id] ?? ambientTemperatureC;
    const nextC = oldC + (equilibriumC - oldC) * -Math.expm1(-Math.max(0, dt) * conductanceWPerK / heatCapacityJPerK);
    return [sensor.id, Math.max(-100, Math.min(200, nextC))];
  }));
}

export function withThermalResult(circuit: Circuit, previous: TransientState, frame: TransientFrame, dt: number): TransientFrame {
  if (!circuit.thermal || frame.result.status === 'error') return frame;
  const sensorTemperaturesC = advanceThermal(circuit, previous, frame.result, dt);
  const warnings = circuit.thermal.heaters.filter(heater => (frame.result.componentPowers[heater.id] ?? 0) > heater.ratedPowerW)
    .map(heater => ({ code: 'HEATER_OVERLOAD', componentId: heater.id, message: `${heater.id} exceeds its power rating. Disconnect power and increase resistance.` }));
  return { state: { ...frame.state, sensorTemperaturesC }, result: { ...frame.result, sensorTemperaturesC,
    warnings: [...frame.result.warnings, ...warnings], status: warnings.length ? 'warning' : frame.result.status } };
}
