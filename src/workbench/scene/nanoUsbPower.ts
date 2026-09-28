import type { PlacedComponent } from '../../domain/components/types';
import type { BreadboardDefinition } from '../../domain/physical/breadboard';
import type { Point3Mm } from '../../domain/physical/geometry';
import { nanoMounting } from '../../domain/physical/arduinoNano';

// Procedural USB accessories illustrate the existing ideal supply; they are not
// extra circuit components or persisted breadboard connections.
export const USB_SUPPLY_SIZE_MM = { x: 24, y: 8, z: 16 } as const;
export const USB_CABLE_RADIUS_MM = 1.35;

export function nanoUsbPowerLayout(board: BreadboardDefinition, centerMm: Point3Mm, rotation: number) {
  const direction = rotation === 180 ? -1 : 1;
  const sourceMm = {
    x: direction * (-board.widthMm / 2 - 34),
    y: -3.65 + USB_SUPPLY_SIZE_MM.y / 2,
    // Separate supplies for modules placed alongside one another.
    z: centerMm.z + centerMm.x * 0.5 + 14,
  };
  const cableStartMm = { x: centerMm.x - direction * 35.5, y: centerMm.y + 2.7, z: centerMm.z };
  const cableEndMm = { x: sourceMm.x + direction * 16, y: sourceMm.y, z: sourceMm.z };
  const cablePointsMm = [
    cableStartMm,
    { ...cableStartMm, x: cableStartMm.x - direction * 4 },
    { x: direction * Math.min(cableStartMm.x * direction - 10, -board.widthMm / 2 - 6),
      y: board.heightMm / 2 + 16, z: centerMm.z },
    { x: cableEndMm.x + direction * 5, y: sourceMm.y + 4, z: sourceMm.z },
    cableEndMm,
  ];
  return { sourceMm, cablePointsMm, direction };
}

/** Include external USB supplies when fitting either camera preset. */
export function workbenchFootprint(board: BreadboardDefinition, components: readonly PlacedComponent[]) {
  let minX = -board.widthMm / 2; let maxX = board.widthMm / 2;
  let minZ = -board.depthMm / 2; let maxZ = board.depthMm / 2;
  for (const component of components) {
    if (component.kind !== 'arduino-nano') continue;
    const mounting = nanoMounting(board, component);
    if (!mounting) continue;
    const { sourceMm, cablePointsMm } = nanoUsbPowerLayout(board, mounting.centerMm, component.rotation);
    minX = Math.min(minX, sourceMm.x - USB_SUPPLY_SIZE_MM.x / 2);
    maxX = Math.max(maxX, sourceMm.x + USB_SUPPLY_SIZE_MM.x / 2);
    minZ = Math.min(minZ, sourceMm.z - USB_SUPPLY_SIZE_MM.z / 2);
    maxZ = Math.max(maxZ, sourceMm.z + USB_SUPPLY_SIZE_MM.z / 2);
    for (const point of cablePointsMm) {
      minX = Math.min(minX, point.x - USB_CABLE_RADIUS_MM);
      maxX = Math.max(maxX, point.x + USB_CABLE_RADIUS_MM);
      minZ = Math.min(minZ, point.z - USB_CABLE_RADIUS_MM);
      maxZ = Math.max(maxZ, point.z + USB_CABLE_RADIUS_MM);
    }
  }
  return { widthMm: maxX - minX, depthMm: maxZ - minZ, centerXmm: (minX + maxX) / 2, centerZmm: (minZ + maxZ) / 2 };
}
