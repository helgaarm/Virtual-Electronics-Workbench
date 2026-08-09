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

function createDipPackage(pinCount: 14 | 16, bodyLengthMm: number): DipPackageDefinition {
  return {
    id: `DIP-${pinCount}`,
    pinCount,
    pinPitchMm: BREADBOARD_PITCH_MM,
    rowSpacingMm: 7.62,
    bodyDimensionsMm: { x: bodyLengthMm, y: 3.9, z: 6.35 },
    leadWidthMm: 0.53,
    leadThicknessMm: 0.25,
  };
}

/** TI N-package nominal envelopes. All members share the same breadboard grid. */
export const DIP_14_PACKAGE = createDipPackage(14, 19.3);
export const DIP_16_PACKAGE = createDipPackage(16, 19.3);

export const DIP_PACKAGES = {
  'DIP-8': DIP_8_PACKAGE,
  'DIP-14': DIP_14_PACKAGE,
  'DIP-16': DIP_16_PACKAGE,
} as const;

export type DipPackageId = keyof typeof DIP_PACKAGES;

/** Clockwise pin coordinates viewed from above, with the notch at the left. */
export function dipPinPositionsMm(definition: DipPackageDefinition): Array<{
  pinNumber: number;
  x: number;
  z: number;
}> {
  if (definition.pinCount % 2 !== 0) throw new Error('A DIP package requires an even pin count.');
  const pinsPerRow = definition.pinCount / 2;
  return Array.from({ length: definition.pinCount }, (_, index) => {
    const pinNumber = index + 1;
    const onNearRow = pinNumber <= pinsPerRow;
    const position = onNearRow ? pinNumber - 1 : definition.pinCount - pinNumber;
    return {
      pinNumber,
      x: position * definition.pinPitchMm,
      z: (onNearRow ? -1 : 1) * definition.rowSpacingMm / 2,
    };
  });
}
