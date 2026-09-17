export interface ThermalSensor {
  id: string; nominalResistanceOhms: number; nominalTemperatureC: number; betaK: number;
  heaterId?: string;
}
export interface ThermalCircuit {
  ambientTemperatureC: number; windSpeedMps: number; sensors: ThermalSensor[];
  heaters: Array<{ id: string; ratedPowerW: number }>;
}
