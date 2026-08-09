export type LogicLevel = 'low' | 'high' | 'indeterminate';

export interface LogicThresholds {
  lowMaximumRatio: number;
  highMinimumRatio: number;
}

export const HC_CMOS_THRESHOLDS: LogicThresholds = {
  lowMaximumRatio: 0.3,
  highMinimumRatio: 0.7,
};

export function logicLevelFromVoltage(
  inputVoltageV: number,
  groundVoltageV: number,
  supplyVoltageV: number,
  thresholds = HC_CMOS_THRESHOLDS,
): LogicLevel {
  const spanV = supplyVoltageV - groundVoltageV;
  if (!Number.isFinite(inputVoltageV) || spanV <= 0) return 'indeterminate';
  const ratio = (inputVoltageV - groundVoltageV) / spanV;
  if (ratio <= thresholds.lowMaximumRatio) return 'low';
  if (ratio >= thresholds.highMinimumRatio) return 'high';
  return 'indeterminate';
}

export interface DigitalOutputDrive {
  level: 'low' | 'high' | 'high-impedance';
  targetVoltageV?: number;
  outputResistanceOhms?: number;
}

export function finiteDigitalOutput(
  level: 'low' | 'high' | 'high-impedance',
  groundVoltageV: number,
  supplyVoltageV: number,
  outputResistanceOhms = 50,
): DigitalOutputDrive {
  return level === 'high-impedance'
    ? { level }
    : { level, targetVoltageV: level === 'high' ? supplyVoltageV : groundVoltageV, outputResistanceOhms };
}

export function detectContention(drives: readonly DigitalOutputDrive[]): boolean {
  const active = drives.filter((drive) => drive.level !== 'high-impedance');
  return active.some((drive) => drive.level === 'high') && active.some((drive) => drive.level === 'low');
}
