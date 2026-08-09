import type { ComponentKind } from '../components/types';
import type { QuarterTurn } from './geometry';
import { DIP_8_PACKAGE } from './dipPackages';
import { DIP_16_PACKAGE } from './dipPackages';
import { TO_92_PACKAGE } from './to92Package';

export interface PhysicalPackageDefinition {
  packageType: string;
  dimensionsMm: { x: number; y: number; z: number };
  leadDiameterMm: number;
  leadSpanMm?: { minimum: number; maximum: number };
  mountingHeightMm: number;
  allowedOrientations: readonly QuarterTurn[];
}

const QUARTER_TURNS = [0, 90, 180, 270] as const;

export const PHYSICAL_PACKAGES: Record<ComponentKind, PhysicalPackageDefinition> = {
  'voltage-source': {
    packageType: 'BENCH_DC_SOURCE',
    dimensionsMm: { x: 8, y: 4.8, z: 5 },
    leadDiameterMm: 0.5,
    leadSpanMm: { minimum: 3, maximum: 8 },
    mountingHeightMm: 5.2,
    allowedOrientations: QUARTER_TURNS,
  },
  ground: {
    packageType: 'GROUND_POST',
    dimensionsMm: { x: 4, y: 5.6, z: 4 },
    leadDiameterMm: 0.5,
    mountingHeightMm: 2.1,
    allowedOrientations: QUARTER_TURNS,
  },
  resistor: {
    packageType: 'AXIAL_RESISTOR_0_25W',
    dimensionsMm: { x: 6.5, y: 2.5, z: 2.5 },
    leadDiameterMm: 0.56,
    leadSpanMm: { minimum: 6.5, maximum: 20.32 },
    mountingHeightMm: 3.7,
    allowedOrientations: QUARTER_TURNS,
  },
  led: {
    packageType: 'LED_5MM',
    dimensionsMm: { x: 5, y: 7, z: 5 },
    leadDiameterMm: 0.44,
    leadSpanMm: { minimum: 2, maximum: 5.08 },
    mountingHeightMm: 5.7,
    allowedOrientations: QUARTER_TURNS,
  },
  capacitor: {
    packageType: 'RADIAL_ELECTROLYTIC_6_3MM',
    dimensionsMm: { x: 6.3, y: 11, z: 6.3 },
    leadDiameterMm: 0.5,
    leadSpanMm: { minimum: 2, maximum: 5.08 },
    mountingHeightMm: 6.25,
    allowedOrientations: QUARTER_TURNS,
  },
  switch: {
    packageType: 'TACTILE_SWITCH_6MM',
    dimensionsMm: { x: 6.2, y: 3.4, z: 6.2 },
    leadDiameterMm: 0.5,
    leadSpanMm: { minimum: 6, maximum: 12.7 },
    mountingHeightMm: 3.25,
    allowedOrientations: QUARTER_TURNS,
  },
  'jumper-wire': {
    packageType: 'JUMPER_WIRE_22AWG',
    dimensionsMm: { x: 0.96, y: 0.96, z: 0.96 },
    leadDiameterMm: 0.5,
    mountingHeightMm: 5,
    allowedOrientations: QUARTER_TURNS,
  },
  ne555: {
    packageType: DIP_8_PACKAGE.id,
    dimensionsMm: DIP_8_PACKAGE.bodyDimensionsMm,
    leadDiameterMm: DIP_8_PACKAGE.leadWidthMm,
    mountingHeightMm: 5.2,
    allowedOrientations: [0, 180],
  },
  tmp36: {
    packageType: TO_92_PACKAGE.id,
    dimensionsMm: {
      x: TO_92_PACKAGE.bodyDimensionsMm.width,
      y: TO_92_PACKAGE.bodyDimensionsMm.height,
      z: TO_92_PACKAGE.bodyDimensionsMm.depth,
    },
    leadDiameterMm: TO_92_PACKAGE.leadDiameterMm,
    mountingHeightMm: 5.4,
    allowedOrientations: [0, 180],
  },
  'diode-1n4148': { packageType: 'DO-35', dimensionsMm: { x: 4.1, y: 2, z: 2 }, leadDiameterMm: 0.46, leadSpanMm: { minimum: 7.62, maximum: 20.32 }, mountingHeightMm: 2.2, allowedOrientations: QUARTER_TURNS },
  bc547: to92Physical(), bc557: to92Physical(), '2n3904': to92Physical(), '2n3906': to92Physical(),
  potentiometer: { packageType: 'THT_TRIMMER_10MM', dimensionsMm: { x: 9.5, y: 4.8, z: 9.5 }, leadDiameterMm: 0.5, mountingHeightMm: 4.8, allowedOrientations: QUARTER_TURNS },
  'seven-segment': { packageType: 'DIP-10-DISPLAY', dimensionsMm: { x: 12.7, y: 7, z: 19 }, leadDiameterMm: 0.5, mountingHeightMm: 6, allowedOrientations: [0, 180] },
  'four-digit-seven-segment': { packageType: '12-PIN-4-DIGIT-DISPLAY', dimensionsMm: { x: 40, y: 8, z: 19 }, leadDiameterMm: 0.5, mountingHeightMm: 6, allowedOrientations: [0, 180] },
  '74hc595': { packageType: DIP_16_PACKAGE.id, dimensionsMm: DIP_16_PACKAGE.bodyDimensionsMm, leadDiameterMm: DIP_16_PACKAGE.leadWidthMm, mountingHeightMm: 5.2, allowedOrientations: [0, 180] },
  attiny85: { packageType: DIP_8_PACKAGE.id, dimensionsMm: DIP_8_PACKAGE.bodyDimensionsMm, leadDiameterMm: DIP_8_PACKAGE.leadWidthMm, mountingHeightMm: 5.2, allowedOrientations: [0, 180] },
};

function to92Physical(): PhysicalPackageDefinition {
  return { packageType: TO_92_PACKAGE.id, dimensionsMm: { x: TO_92_PACKAGE.bodyDimensionsMm.width, y: TO_92_PACKAGE.bodyDimensionsMm.height, z: TO_92_PACKAGE.bodyDimensionsMm.depth }, leadDiameterMm: TO_92_PACKAGE.leadDiameterMm, mountingHeightMm: 5.4, allowedOrientations: [0, 180] };
}

export function leadSpanViolation(
  kind: ComponentKind,
  spanMm: number,
): 'too-short' | 'too-long' | undefined {
  const limits = PHYSICAL_PACKAGES[kind].leadSpanMm;
  if (!limits) return undefined;
  if (spanMm + Number.EPSILON < limits.minimum) return 'too-short';
  if (spanMm - Number.EPSILON > limits.maximum) return 'too-long';
  return undefined;
}
