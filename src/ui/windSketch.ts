import source from '../../examples/WindSensor/WindSensor.ino?raw';
import type { ArduinoNanoComponent } from '../domain/components/types';
import { DEFAULT_WIND_SETTINGS } from '../domain/components/windSensor';

export function windSketch(component: ArduinoNanoComponent): string {
  const settings = component.windSettings ?? DEFAULT_WIND_SETTINGS;
  let sketch = source.replace('const bool CONSTANT_TEMPERATURE = false;', `const bool CONSTANT_TEMPERATURE = ${component.programId === 'wind-constant-temperature'};`);
  for (const [name, value] of Object.entries({ NTC_NOMINAL_OHMS: settings.nominalResistanceOhms, NTC_NOMINAL_C: settings.nominalTemperatureC,
    NTC_BETA_K: settings.betaK, AIR_FIXED_OHMS: settings.ambientFixedResistanceOhms, HOT_FIXED_OHMS: settings.heatedFixedResistanceOhms,
    TARGET_DELTA_C: settings.targetDeltaC, HEATER_OHMS: settings.heaterResistanceOhms, MOSFET_ON_OHMS: settings.driverOnResistanceOhms })) {
    sketch = sketch.replace(new RegExp(`const float ${name} = [^;]+;`), `const float ${name} = ${Number.isInteger(value) ? value.toFixed(1) : value}f;`);
  }
  if (settings.calibration.length) {
    sketch = sketch.replace('const bool CALIBRATION_ENTERED = false;', 'const bool CALIBRATION_ENTERED = true;')
      .replace(/const CalibrationPoint CALIBRATION\[\] = \{[\s\S]*?\};/, `const CalibrationPoint CALIBRATION[] = {\n${settings.calibration.map(point => `  {${point.speedMps.toFixed(6)}f, ${point.signal.toFixed(6)}f}`).join(',\n')}\n};`);
  }
  return sketch;
}

export function downloadWindText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
