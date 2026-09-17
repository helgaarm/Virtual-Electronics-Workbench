/** Shared, unit-explicit math for the examples; calibration never comes from environment wind. */
export interface WindCalibrationPoint { speedMps: number; signal: number }
export interface WindSensorSettings {
  nominalResistanceOhms: number;
  nominalTemperatureC: number;
  betaK: number;
  ambientFixedResistanceOhms: number;
  heatedFixedResistanceOhms: number;
  heaterResistanceOhms: number;
  driverOnResistanceOhms: number;
  targetDeltaC: number;
  calibration: WindCalibrationPoint[];
}
export const DEFAULT_WIND_SETTINGS: WindSensorSettings = {
  nominalResistanceOhms: 10_000, nominalTemperatureC: 25, betaK: 3950,
  ambientFixedResistanceOhms: 10_000, heatedFixedResistanceOhms: 10_000,
  heaterResistanceOhms: 150, driverOnResistanceOhms: 5.3,
  targetDeltaC: 20, calibration: [],
};
export function ntcResistanceOhms(temperatureC: number, nominalOhms: number, nominalC: number, betaK: number): number {
  return nominalOhms * Math.exp(betaK * (1 / (temperatureC + 273.15) - 1 / (nominalC + 273.15)));
}
export function thermistorReading(adc: number, fixedOhms: number, settings: Pick<WindSensorSettings, 'nominalResistanceOhms' | 'nominalTemperatureC' | 'betaK'>): { resistanceOhms: number; temperatureC: number } | undefined {
  if (!Number.isFinite(adc) || adc <= 1 || adc >= 1022 || fixedOhms <= 0) return undefined;
  // AVCC powers the divider and is the ADC reference: the voltage cancels.
  const resistanceOhms = fixedOhms * adc / (1023 - adc);
  const kelvin = 1 / (1 / (settings.nominalTemperatureC + 273.15) + Math.log(resistanceOhms / settings.nominalResistanceOhms) / settings.betaK);
  const temperatureC = kelvin - 273.15;
  return Number.isFinite(temperatureC) && temperatureC >= -40 && temperatureC <= 125 ? { resistanceOhms, temperatureC } : undefined;
}
export function validWindCalibration(points: readonly WindCalibrationPoint[], increasing: boolean): boolean {
  return points.length >= 2 && points.length <= 20 && points.every((p, i) => Number.isFinite(p.signal) && p.signal > 0 && p.signal <= 200
    && Number.isFinite(p.speedMps) && p.speedMps >= 0 && p.speedMps <= 100
    && (!i || (p.speedMps > points[i - 1].speedMps && (increasing ? p.signal > points[i - 1].signal : p.signal < points[i - 1].signal))));
}
/** No extrapolation: missing, non-monotonic or out-of-range calibration is unknown. */
export function calibratedWindSpeed(signal: number, points: readonly WindCalibrationPoint[], increasing: boolean): number | undefined {
  if (!Number.isFinite(signal) || !validWindCalibration(points, increasing)) return undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    if (signal >= Math.min(a.signal, b.signal) && signal <= Math.max(a.signal, b.signal)) {
      return a.speedMps + (signal - a.signal) * (b.speedMps - a.speedMps) / (b.signal - a.signal);
    }
  }
  return undefined;
}
