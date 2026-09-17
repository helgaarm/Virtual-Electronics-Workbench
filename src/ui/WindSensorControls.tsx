import { useState } from 'react';
import type { ArduinoNanoComponent } from '../domain/components/types';
import type { DigitalState } from '../domain/circuit/digital';
import { DEFAULT_WIND_SETTINGS, validWindCalibration, type WindSensorSettings } from '../domain/components/windSensor';
import guide from '../../docs/wind-sensor.md?raw';
import { downloadWindText } from './windSketch';

export function WindSensorControls({ component, onUpdate, readings }: { component: ArduinoNanoComponent; onUpdate: (component: ArduinoNanoComponent) => void; readings?: DigitalState['nanos'][string]['wind'] }) {
  const settings = component.windSettings ?? DEFAULT_WIND_SETTINGS;
  const cta = component.programId === 'wind-constant-temperature';
  const [table, setTable] = useState(settings.calibration.map(p => `${p.speedMps}, ${p.signal}`).join('\n'));
  const [message, setMessage] = useState('');
  const update = (patch: Partial<WindSensorSettings>) => onUpdate({ ...component, windSettings: { ...settings, ...patch } });
  const applyCalibration = () => {
    const rows = table.trim() ? table.trim().split(/\r?\n/).map(line => line.trim().split(/[,;\s]+/).map(Number)) : [];
    const points = rows.map(([speedMps, signal]) => ({ speedMps, signal }));
    if (points.length && (rows.some(row => row.length !== 2) || !validWindCalibration(points, cta))) {
      setMessage(`Enter 2–20 measured rows: speed in m/s, ${cta ? 'power in W increasing' : 'delta °C decreasing'}. Speed must increase. No duplicate values.`); return;
    }
    update({ calibration: points }); setMessage(points.length ? 'Measured calibration applied.' : 'Calibration cleared. Wind remains unknown.');
  };
  const number = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? value.toFixed(1) : '--.-';
  return <section className="inspector-section wind-sensor-controls">
    <div className="section-label">Wind sensor</div>
    <p>Change Environment wind and temperature to explore the sensor. Thermal behavior is illustrative; calibrate your physical assembly separately.</p>
    <button onClick={() => downloadWindText('wind-sensor-guide.md', guide)}>Download build and calibration guide</button>
    <dl aria-label="Wind sensor readings">
      <dt>Wind</dt><dd>{number(readings?.speedMps)} m/s</dd>
      <dt>Air / hot</dt><dd>{number(readings?.airC)} / {number(readings?.hotC)} °C</dd>
      <dt>Delta</dt><dd>{number(readings?.deltaC)} °C</dd>
      <dt>Heater duty</dt><dd>{number(readings ? readings.duty * 100 : undefined)}%</dd>
      <dt>Estimated mean power</dt><dd>{readings?.powerW.toFixed(4) ?? '----'} W</dd>
    </dl>
    <p role="status">{readings?.status ?? 'Waiting for powered sensor readings'}</p>
    {readings?.fault && <p>Heater shut down. Correct the sensor fault or temperature limit, then switch power off and on to reset.</p>}
    <details><summary>Thermistors and control</summary>
      {([
        ['nominalResistanceOhms', 'NTC nominal resistance (Ω)', 100, 1e6],
        ['nominalTemperatureC', 'NTC nominal temperature (°C)', -40, 100],
        ['betaK', 'Beta coefficient (K)', 1000, 6000],
        ['ambientFixedResistanceOhms', 'Ambient fixed resistor (Ω)', 100, 1e6],
        ['heatedFixedResistanceOhms', 'Heated fixed resistor (Ω)', 100, 1e6],
        ['heaterResistanceOhms', 'Heater resistance for power estimate (Ω)', 10, 100000],
        ['driverOnResistanceOhms', 'Driver on resistance (Ω)', 0, 100],
        ['targetDeltaC', 'Target above ambient (°C)', 1, 30],
      ] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step="any" value={settings[key]} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= min && value <= max) update({ [key]: value }); }} /></label>)}
      <small>Calibration and conversion settings belong to the Nano sketch. Select each NTC to change its physical model parameters.</small>
    </details>
    <details><summary>Measured calibration points</summary>
      <p>{cta ? 'Enter average heater power in watts at each known speed, only after the target temperature has settled. The 150 Ω heater may reach its limit.' : 'Enter stabilized temperature difference in °C at each known speed.'}</p>
      <label>Speed (m/s), {cta ? 'power (W)' : 'delta (°C)'}<textarea rows={6} value={table} onChange={e => setTable(e.target.value)} placeholder={cta ? 'One measured pair per line' : 'One measured pair per line'} /></label>
      <button onClick={applyCalibration}>Apply calibration</button>
      <p role="status">{message}</p>
      <small>No extrapolation. Changing the heater, mounting, orientation or controller mode requires a new calibration.</small>
    </details>
  </section>;
}
