export const LIGHT_TYPES = ['daylight', 'incandescent', 'fluorescent', 'led', 'ultraviolet', 'infrared', 'custom'] as const;
export type LightType = (typeof LIGHT_TYPES)[number];

export interface ExternalEnvironment {
  temperatureC: number;
  relativeHumidityPercent: number;
  windSpeedMps: number;
  illuminanceLux: number;
  lightType: LightType;
  wavelengthNm: number;
}

export const DEFAULT_EXTERNAL_ENVIRONMENT: ExternalEnvironment = {
  temperatureC: 25,
  relativeHumidityPercent: 50,
  windSpeedMps: 0,
  illuminanceLux: 500,
  lightType: 'daylight',
  wavelengthNm: 550,
};

export const LIGHT_TYPE_WAVELENGTH_NM: Readonly<Record<Exclude<LightType, 'custom'>, number>> = {
  daylight: 550,
  incandescent: 650,
  fluorescent: 545,
  led: 470,
  ultraviolet: 365,
  infrared: 850,
};

