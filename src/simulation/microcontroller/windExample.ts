import type { Circuit } from '../../domain/circuit/types';
import type { DigitalDevice, DigitalState } from '../../domain/circuit/digital';
import { calibratedWindSpeed, DEFAULT_WIND_SETTINGS, thermistorReading } from '../../domain/components/windSensor';
import { windDisplayPage } from '../../domain/components/windFont';
import { connectedOled, oledTransaction } from '../models/oled';

export function sampleWindExample(circuit: Circuit, digital: DigitalState, device: DigitalDevice, time: number, voltages: Record<string, number>): void {
  const nano = digital.nanos[device.id];
  const settings = device.windSettings ?? DEFAULT_WIND_SETTINGS;
  const cta = device.programId === 'wind-constant-temperature';
  const ground = voltages[device.pins.pin4] ?? 0;
  const supply = (voltages[device.pins.pin27] ?? 0) - ground;
  if (!nano.powered) { nano.wind = undefined; nano.outputHigh = false; nano.nextTimeSeconds = time + 0.01; return; }
  const old = nano.wind;
  if (!old || time - old.lastSampleSeconds >= 0.1 - 1e-8) {
    const adc = (pin: number) => Math.max(0, Math.min(1023, Math.floor(((voltages[device.pins[`pin${pin}`]] ?? 0) - ground) / supply * 1024)));
    const adcAir = adc(19); const adcHot = adc(20);
    const air = thermistorReading(adcAir, settings.ambientFixedResistanceOhms, settings);
    const hot = thermistorReading(adcHot, settings.heatedFixedResistanceOhms, settings);
    const airC = air ? (old && Number.isFinite(old.airC) ? old.airC + 0.2 * (air.temperatureC - old.airC) : air.temperatureC) : NaN;
    const hotC = hot ? (old && Number.isFinite(old.hotC) ? old.hotC + 0.2 * (hot.temperatureC - old.hotC) : hot.temperatureC) : NaN;
    const deltaC = hotC - airC;
    const fault = old?.fault === true || !air || !hot || hot.temperatureC >= 65 || hot.temperatureC - air.temperatureC >= 35 || (cta && air.temperatureC + settings.targetDeltaC >= 65);
    let integral = old?.integral ?? 0;
    const error = settings.targetDeltaC - deltaC;
    const dt = old ? Math.min(0.5, time - old.lastSampleSeconds) : 0.1;
    if (!fault && cta) {
      const candidate = integral + error * 0.005 * dt;
      const output = error * 0.025 + candidate;
      if ((output > 0 && output < 1) || (output >= 1 && error < 0) || (output <= 0 && error > 0)) integral = candidate;
    }
    if (fault) integral = 0;
    const duty = fault ? 0 : cta ? Math.max(0, Math.min(1, error * 0.025 + integral)) : 1;
    const settledSince = cta && !fault && Math.abs(error) <= 1 && duty < 0.98 ? old?.settledSince ?? time : undefined;
    const settled = cta ? settledSince !== undefined && time - settledSince >= 5 : time - nano.startedAtSeconds >= 30;
    // Same duty/resistance approximation as the physical sketch; power is averaged for CTA calibration.
    const onCurrentA = supply / (settings.heaterResistanceOhms + settings.driverOnResistanceOhms);
    const estimatedW = duty * onCurrentA * onCurrentA * settings.heaterResistanceOhms;
    const powerW = (old?.powerW ?? 0) + 0.05 * (estimatedW - (old?.powerW ?? 0));
    const speedMps = !fault && settled ? calibratedWindSpeed(cta ? powerW : deltaC, settings.calibration, cta) : undefined;
    const status = fault ? 'SENSOR FAULT' : cta && duty >= 0.98 && error > 1 ? 'HEATER LIMIT' : !settled ? 'WARMING' : !settings.calibration.length ? 'UNCALIBRATED' : speedMps === undefined ? 'OUT OF RANGE' : 'CALIBRATED';
    nano.wind = { airC, hotC, deltaC, duty, integral, lastSampleSeconds: time, settledSince, status, speedMps, powerW, adcAir, adcHot, fault };
    const number = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '--.-';
    const lines = ['WIND SENSOR', '', `WIND: ${number(speedMps ?? NaN)} M/S`, `AIR: ${number(airC)} C`, `HOT: ${number(hotC)} C`, `DELTA: ${number(deltaC)} C`, cta ? `PWM: ${Math.round(duty * 100)}% ${powerW.toFixed(3)}W` : 'CONSTANT POWER', status];
    // The example sends controller bytes only to a powered OLED on the actual A4/A5 nets.
    const display = connectedOled(circuit, device, 0x3c, voltages);
    if (display) {
      oledTransaction(circuit, digital, device, 0x3c, [0, 0xaf, 0x20, 2], voltages);
      lines.forEach((line, page) => {
        oledTransaction(circuit, digital, device, 0x3c, [0, 0xb0 | page, display.controller === 'sh1106' ? 2 : 0, 0x10], voltages);
        oledTransaction(circuit, digital, device, 0x3c, [0x40, ...windDisplayPage(line)], voltages);
      });
    }
  }
  // A bounded 50 Hz behavioural PWM bridge; compiled sketches use the actual AVR timer.
  const period = 0.02;
  const cycleStart = Math.floor((time + 1e-9) / period) * period;
  const duty = nano.wind?.duty ?? 0;
  nano.outputHigh = duty > 0 && (duty >= 1 || time - cycleStart < duty * period - 1e-9);
  const edge = nano.outputHigh && duty < 1 ? cycleStart + duty * period : cycleStart + period;
  nano.nextTimeSeconds = Math.max(time + 1e-7, Math.min(edge, (nano.wind?.lastSampleSeconds ?? time) + 0.1));
}
