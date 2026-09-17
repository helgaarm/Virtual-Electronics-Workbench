import type { OledComponent } from '../components/types';
import type { BreadboardDefinition } from './breadboard';
import { BREADBOARD_PITCH_MM, type Point3Mm } from './geometry';

/** Module outline from the LCDWIKI MC130GX reference. Header, solder and insulating
 * feet are procedural mounting assumptions, not additional electrical terminals. */
export const OLED_PACKAGE = {
  widthMm: 35.4,
  depthMm: 33.5,
  heightMm: 4,
  pcbThicknessMm: 1.6,
  headerEdgeOffsetMm: 2.55,
  headerHeightMm: 2.5,
  pinWidthMm: 0.64,
  insertionDepthMm: 2.5,
  pinProtrusionMm: 0.6,
  footRadiusMm: 2,
  get mountingHeightMm() { return this.headerHeightMm + this.pcbThicknessMm / 2; },
} as const;

export const OLED_TERMINALS = ['gnd', 'vcc', 'scl', 'sda'] as const;

/** Derived geometry uses the actual assigned holes, so rotation/movement cannot
 * detach the header from either the PCB or the breadboard. */
export function oledMounting(board: BreadboardDefinition, component: OledComponent) {
  const holes = OLED_TERMINALS.map(terminal => board.holes.find(hole => hole.id === component.terminalHoleIds[terminal]));
  if (holes.some(hole => !hole)) return undefined;
  const headerCenterMm = holes.reduce<Point3Mm>((center, hole) => ({
    x: center.x + hole!.positionMm.x / 4,
    y: center.y + hole!.positionMm.y / 4,
    z: center.z + hole!.positionMm.z / 4,
  }), { x: 0, y: 0, z: 0 });
  const direction = component.rotation === 180 ? -1 : 1;
  const headerOffsetMm = OLED_PACKAGE.depthMm / 2 - OLED_PACKAGE.headerEdgeOffsetMm;
  const pcbCenterMm = { ...headerCenterMm, y: headerCenterMm.y + OLED_PACKAGE.mountingHeightMm,
    z: headerCenterMm.z + direction * headerOffsetMm };
  const pcbBottomYmm = pcbCenterMm.y - OLED_PACKAGE.pcbThicknessMm / 2;
  const pins = holes.map((hole, index) => ({ terminal: OLED_TERMINALS[index],
    bottomMm: { ...hole!.positionMm, y: hole!.positionMm.y - OLED_PACKAGE.insertionDepthMm },
    topMm: { ...hole!.positionMm, y: pcbCenterMm.y + OLED_PACKAGE.pcbThicknessMm / 2 + OLED_PACKAGE.pinProtrusionMm },
  }));
  const feet = [-1, 1].map(side => ({
    x: pcbCenterMm.x + side * (OLED_PACKAGE.widthMm / 2 - OLED_PACKAGE.headerEdgeOffsetMm),
    z: pcbCenterMm.z + direction * headerOffsetMm,
  })).filter(point => Math.abs(point.x) + OLED_PACKAGE.footRadiusMm < board.widthMm / 2
    && Math.abs(point.z) + OLED_PACKAGE.footRadiusMm < board.depthMm / 2)
    .map(point => ({ ...point, y: (board.heightMm / 2 + pcbBottomYmm) / 2,
      heightMm: pcbBottomYmm - board.heightMm / 2 }));
  return { headerCenterMm: { ...headerCenterMm, y: headerCenterMm.y + OLED_PACKAGE.headerHeightMm / 2 },
    headerWidthMm: OLED_TERMINALS.length * BREADBOARD_PITCH_MM, pcbCenterMm, pins, feet };
}
