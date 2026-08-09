import { BREADBOARD_PITCH_MM } from './geometry';

export interface DipPackageDefinition {
  id: string;
  pinCount: number;
  pinPitchMm: number;
  rowSpacingMm: number;
  bodyDimensionsMm: { x: number; y: number; z: number };
  leadWidthMm: number;
  leadThicknessMm: number;
}

/** TI P-package maximum body envelope for the 8-pin PDIP. */
export const DIP_8_PACKAGE: DipPackageDefinition = {
  id: 'DIP-8',
  pinCount: 8,
  pinPitchMm: BREADBOARD_PITCH_MM,
  rowSpacingMm: 7.62,
  bodyDimensionsMm: { x: 9.81, y: 3.9, z: 6.35 },
  leadWidthMm: 0.53,
  leadThicknessMm: 0.25,
};

export const DIP_PACKAGES = { 'DIP-8': DIP_8_PACKAGE } as const;
