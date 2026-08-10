export type PcbPointMm = Readonly<{ xMm: number; yMm: number }>;
export type PcbSide = 'top' | 'bottom';
export type PcbCopperLayer = 'F.Cu' | 'B.Cu';
export type PcbLayerMode = 'single' | 'double';
export type PcbPadShape = 'circle' | 'rect' | 'oval';

export interface PcbPadDefinition {
  number: string;
  terminalId: string;
  positionMm: PcbPointMm;
  sizeMm: Readonly<{ widthMm: number; heightMm: number }>;
  drillDiameterMm: number;
  plated: boolean;
  shape: PcbPadShape;
}

export interface PcbFootprint {
  id: string;
  name: string;
  compatibleKinds: readonly string[];
  bodySizeMm: Readonly<{ widthMm: number; heightMm: number }>;
  courtyardMarginMm: number;
  pads: readonly PcbPadDefinition[];
  verified: boolean;
  source: string;
  pin1Marked?: boolean;
}

export interface PcbComponent {
  id: string;
  sourceComponentId: string;
  reference: string;
  value: string;
  footprintId: string;
  positionMm: PcbPointMm;
  rotationDegrees: 0 | 90 | 180 | 270;
  locked: boolean;
}

export interface PcbNetPadRef {
  componentId: string;
  padNumber: string;
  terminalId: string;
  sourceHoleId: string;
}

export interface PcbNet { id: string; name: string; pads: PcbNetPadRef[] }
export interface PcbTrace {
  id: string; netId: string; widthMm: number; layer: PcbCopperLayer;
  pointsMm: PcbPointMm[]; ownership: 'auto' | 'manual' | 'manual-modified';
}
export interface PcbVia { id: string; netId: string; positionMm: PcbPointMm; drillDiameterMm: number; copperDiameterMm: number; fromLayer: 'F.Cu'; toLayer: 'B.Cu'; ownership: 'auto' | 'manual' | 'manual-modified' }
export interface PcbJumper { id: string; reference: string; netId: string; startMm: PcbPointMm; endMm: PcbPointMm; drillDiameterMm: number; copperDiameterMm: number; ownership: 'auto' | 'manual' | 'manual-modified' }
export interface PcbMountingHole { id: string; positionMm: PcbPointMm; drillDiameterMm: number; plated: false }
export interface PcbDesignRules {
  profileId: 'generic-conservative'; minimumTrackWidthMm: number; copperClearanceMm: number;
  minimumDrillMm: number; minimumAnnularRingMm: number; copperToEdgeMm: number;
  componentToEdgeMm: number; silkscreenToPadMm: number;
}
export interface PcbProject {
  version: 2;
  sourceCircuitFingerprint: string;
  board: { widthMm: number; heightMm: number; title: string; layerMode: PcbLayerMode };
  components: PcbComponent[]; nets: PcbNet[]; traces: PcbTrace[]; jumpers: PcbJumper[];
  vias: PcbVia[]; mountingHoles: PcbMountingHole[]; rules: PcbDesignRules;
}

export const DEFAULT_PCB_RULES: PcbDesignRules = {
  profileId: 'generic-conservative', minimumTrackWidthMm: 0.25, copperClearanceMm: 0.25,
  minimumDrillMm: 0.6, minimumAnnularRingMm: 0.15, copperToEdgeMm: 0.4,
  componentToEdgeMm: 1, silkscreenToPadMm: 0.2,
};
