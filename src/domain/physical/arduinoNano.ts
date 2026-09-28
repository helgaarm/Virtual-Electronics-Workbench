import type { ArduinoNanoComponent } from '../components/types';
import type { BreadboardDefinition } from './breadboard';
import { terminalHoleId } from './breadboard';

// 45 × 18 mm PCB, 15 pins per row, 2.54 mm pitch, 15.24 mm between rows.
export const NANO_PACKAGE = { lengthMm: 45, widthMm: 18, rowSpacingMm: 15.24, leadWidthMm: 0.64 } as const;

export function nanoMounting(board: BreadboardDefinition, component: ArduinoNanoComponent) {
  const holes = Array.from({ length: 30 }, (_, i) => board.holes.find(hole => hole.id === component.terminalHoleIds[`pin${i + 1}`]));
  if (holes.some(hole => !hole)) return undefined;
  const pins = holes.filter(hole => hole !== undefined);
  const centerMm = pins.reduce((center, hole) => ({
    x: center.x + hole.positionMm.x / 30,
    y: center.y,
    z: center.z + hole.positionMm.z / 30,
  }), { x: 0, y: pins[0].positionMm.y + 4, z: 0 });
  return { pins, centerMm };
}

export function nanoTerminalHoles(boardId: string, startColumn: number): Record<`pin${number}`, string> {
  return Object.fromEntries(Array.from({ length: 30 }, (_, i) => [
    `pin${i + 1}`, terminalHoleId(boardId, i < 15 ? 'D' : 'H', startColumn + (i < 15 ? i : 29 - i)),
  ]));
}

export function validNanoPlacement(board: BreadboardDefinition, component: ArduinoNanoComponent): boolean {
  const holes = Array.from({ length: 30 }, (_, i) => board.holes.find((h) => h.id === component.terminalHoleIds[`pin${i + 1}`]));
  const origin = holes[0];
  if (!origin || ![0, 180].includes(component.rotation)) return false;
  const direction = component.rotation === 0 ? 1 : -1;
  return holes.every((hole, i) => hole?.kind === 'terminal'
    && Math.abs(hole.positionMm.x - origin.positionMm.x - direction * (i < 15 ? i : 29 - i) * 2.54) < 0.01
    && Math.abs(hole.positionMm.z - origin.positionMm.z - direction * (i < 15 ? 0 : 15.24)) < 0.01
    && (i < 15 ? hole.positionMm.z * direction < 0 : hole.positionMm.z * direction > 0));
}
