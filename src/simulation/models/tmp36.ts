import type { ElectricalSubcircuit } from '../../domain/circuit/types';

export const TMP36_MINIMUM_TEMPERATURE_C = -40;
export const TMP36_MAXIMUM_TEMPERATURE_C = 125;
export const TMP36_MINIMUM_SUPPLY_V = 2.7;
export const TMP36_MAXIMUM_SUPPLY_V = 5.5;
export const TMP36_OFFSET_V = 0.5;
export const TMP36_SCALE_V_PER_C = 0.01;

export interface Tmp36Output {
  outputVoltageV: number;
  validSupply: boolean;
  clampedTemperatureC: number;
}

/** AD TMP36 nominal transfer model: 750 mV at 25 °C and 10 mV/°C. */
export function tmp36Output(temperatureC: number, supplyVoltageV: number): Tmp36Output {
  const clampedTemperatureC = Math.min(TMP36_MAXIMUM_TEMPERATURE_C, Math.max(TMP36_MINIMUM_TEMPERATURE_C, temperatureC));
  const validSupply = supplyVoltageV >= TMP36_MINIMUM_SUPPLY_V && supplyVoltageV <= TMP36_MAXIMUM_SUPPLY_V;
  return {
    outputVoltageV: validSupply ? Math.min(supplyVoltageV, TMP36_OFFSET_V + TMP36_SCALE_V_PER_C * clampedTemperatureC) : 0,
    validSupply,
    clampedTemperatureC,
  };
}

/** Supply-qualified analogue output. Both supply pins participate in the solver. */
export function createTmp36Subcircuit(id: string, pins: Record<string, string>, temperatureC: number): ElectricalSubcircuit {
  return { id, kind: 'subcircuit', externalNodes: pins, definition: {
    externalNodeIds: ['vs', 'vout', 'gnd'], internalNodeIds: ['target', 'lower', 'upper', 'enabled'],
    components: [
      { id: 'transfer', kind: 'voltage-source', positiveNodeId: 'target', negativeNodeId: 'gnd', voltageV: tmp36Output(temperatureC, 5).outputVoltageV },
      { id: 'minimum', kind: 'voltage-source', positiveNodeId: 'lower', negativeNodeId: 'gnd', voltageV: 2.7 },
      { id: 'maximum', kind: 'voltage-source', positiveNodeId: 'upper', negativeNodeId: 'gnd', voltageV: 5.5 },
      { id: 'supply-load', kind: 'resistor', positiveNodeId: 'vs', negativeNodeId: 'gnd', resistanceOhms: 100_000 },
      { id: 'undervoltage', kind: 'smooth-switch', positiveNodeId: 'target', negativeNodeId: 'enabled', controlPositiveNodeId: 'vs', controlNegativeNodeId: 'lower', onResistanceOhms: 50, transitionVoltageV: 0.01 },
      { id: 'overvoltage', kind: 'smooth-switch', positiveNodeId: 'enabled', negativeNodeId: 'vout', controlPositiveNodeId: 'upper', controlNegativeNodeId: 'vs', onResistanceOhms: 50, transitionVoltageV: 0.01 },
      { id: 'output-leak', kind: 'resistor', positiveNodeId: 'vout', negativeNodeId: 'gnd', resistanceOhms: 1e9 },
    ],
  } };
}
