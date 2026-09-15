import { LIGHT_TYPES, LIGHT_TYPE_WAVELENGTH_NM, type ExternalEnvironment, type LightType } from '../domain/environment';

interface Props {
  environment: ExternalEnvironment;
  onChange: (environment: ExternalEnvironment) => void;
}

function bounded(raw: string, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number(raw) || 0));
}

export function EnvironmentPanel({ environment, onChange }: Props) {
  const update = (change: Partial<ExternalEnvironment>) => onChange({ ...environment, ...change });
  const selectLightType = (lightType: LightType) => update({
    lightType,
    ...(lightType === 'custom' ? {} : { wavelengthNm: LIGHT_TYPE_WAVELENGTH_NM[lightType] }),
  });
  return (
    <section className="environment-panel" aria-label="External environment">
      <div className="environment-heading"><span aria-hidden="true">☼</span><div><strong>Environment</strong><small>Shared sensor conditions</small></div></div>
      <label>Temperature<div className="environment-input"><input aria-label="Environment temperature" type="number" min="-80" max="100" step="1" value={environment.temperatureC} onChange={(event) => update({ temperatureC: bounded(event.target.value, -80, 100) })} /><span>°C</span></div></label>
      <label>Humidity<div className="environment-input"><input aria-label="Relative humidity" type="number" min="0" max="100" step="1" value={environment.relativeHumidityPercent} onChange={(event) => update({ relativeHumidityPercent: bounded(event.target.value, 0, 100) })} /><span>% RH</span></div></label>
      <label>Wind<div className="environment-input"><input aria-label="Wind speed" type="number" min="0" max="100" step="0.1" value={environment.windSpeedMps} onChange={(event) => update({ windSpeedMps: bounded(event.target.value, 0, 100) })} /><span>m/s</span></div></label>
      <label>Light type<select aria-label="Light type" value={environment.lightType} onChange={(event) => selectLightType(event.target.value as LightType)}>{LIGHT_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
      <label>Illuminance<div className="environment-input"><input aria-label="Illuminance" type="number" min="0" max="200000" step="10" value={environment.illuminanceLux} onChange={(event) => update({ illuminanceLux: bounded(event.target.value, 0, 200_000) })} /><span>lx</span></div></label>
      <label>Wavelength<div className="environment-input"><input aria-label="Dominant wavelength" type="number" min="100" max="2000" step="1" value={environment.wavelengthNm} onChange={(event) => update({ wavelengthNm: bounded(event.target.value, 100, 2_000), lightType: 'custom' })} /><span>nm</span></div></label>
    </section>
  );
}
