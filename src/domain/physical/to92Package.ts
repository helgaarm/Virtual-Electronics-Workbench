import { BREADBOARD_PITCH_MM } from './geometry';

export interface To92PackageDefinition {
  id: 'TO-92-inline';
  bodyDimensionsMm: { width: number; height: number; depth: number };
  leadDiameterMm: number;
  leadPitchMm: number;
  pinPositionsMm: readonly [{ x: number; z: number }, { x: number; z: number }, { x: number; z: number }];
}

/** JEDEC-style inline TO-92 envelope. Pin semantics intentionally live on devices. */
export const TO_92_PACKAGE: To92PackageDefinition = {
  id: 'TO-92-inline',
  bodyDimensionsMm: { width: 4.8, height: 5.2, depth: 3.8 },
  leadDiameterMm: 0.48,
  leadPitchMm: BREADBOARD_PITCH_MM,
  pinPositionsMm: [
    { x: -BREADBOARD_PITCH_MM, z: 0 },
    { x: 0, z: 0 },
    { x: BREADBOARD_PITCH_MM, z: 0 },
  ],
};
