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
