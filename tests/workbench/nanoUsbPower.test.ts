import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ArduinoNanoComponent } from '../../src/domain/components/types';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { nanoMounting } from '../../src/domain/physical/arduinoNano';
import { createPlacedComponent, movePlacedComponent, rotatePlacedComponent } from '../../src/state/workbenchActions';
import { nanoUsbPowerLayout, USB_CABLE_RADIUS_MM, USB_SUPPLY_SIZE_MM, workbenchFootprint } from '../../src/workbench/scene/nanoUsbPower';
import { workbenchCameraPose } from '../../src/workbench/scene/boardFraming';
import { createSmoothTubeGeometry } from '../../src/workbench/scene/smoothTubeGeometry';

describe('Nano USB power accessories', () => {
  it.each([0, 180])('keeps the cable attached and the supply clear of the board at %s degrees', rotation => {
    const board = createBreadboardDefinition();
    let nano = createPlacedComponent('arduino-nano', board, []) as ArduinoNanoComponent;
    if (rotation) nano = rotatePlacedComponent(board, nano, [nano]) as ArduinoNanoComponent;
    const original = structuredClone(nano);
    const mounting = nanoMounting(board, nano)!;
    const layout = nanoUsbPowerLayout(board, mounting.centerMm, nano.rotation);
    const exit = new THREE.Vector3(-35.5, 2.7, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation * Math.PI / 180)
      .add(new THREE.Vector3(mounting.centerMm.x, mounting.centerMm.y, mounting.centerMm.z));
    const start = layout.cablePointsMm[0];
    expect(new THREE.Vector3(start.x, start.y, start.z).distanceTo(exit)).toBeLessThan(1e-8);
    expect(Math.abs(layout.sourceMm.x) - USB_SUPPLY_SIZE_MM.x / 2).toBeGreaterThan(board.widthMm / 2);
    expect(layout.sourceMm.y - USB_SUPPLY_SIZE_MM.y / 2).toBeCloseTo(-3.65, 8);
    const geometry = createSmoothTubeGeometry(layout.cablePointsMm.map(point => new THREE.Vector3(point.x, point.y, point.z)), USB_CABLE_RADIUS_MM, 48);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      expect(Number.isFinite(point.length())).toBe(true);
      expect(point.y).toBeGreaterThan(-3.65);
      if (Math.abs(point.x) < board.widthMm / 2 && Math.abs(point.z) < board.depthMm / 2) {
        expect(point.y).toBeGreaterThan(board.heightMm / 2);
      }
    }
    geometry.dispose();
    expect(nano).toEqual(original);
  });

  it('moves the plug with the Nano while the supply remains beside the board', () => {
    const board = createBreadboardDefinition('main', 63);
    const nano = createPlacedComponent('arduino-nano', board, []) as ArduinoNanoComponent;
    const moved = movePlacedComponent(board, nano, 'main:D25', [nano]) as ArduinoNanoComponent;
    const initial = nanoMounting(board, nano)!;
    const next = nanoMounting(board, moved)!;
    const before = nanoUsbPowerLayout(board, initial.centerMm, nano.rotation);
    const after = nanoUsbPowerLayout(board, next.centerMm, moved.rotation);
    expect(after.cablePointsMm[0].x - before.cablePointsMm[0].x).toBeCloseTo(next.centerMm.x - initial.centerMm.x, 8);
    expect(after.sourceMm.x).toBe(before.sourceMm.x);
  });

  it.each([0.5, 1.6])('frames the board, supply and cable at viewport aspect %s', aspect => {
    for (const columns of [30, 63]) for (const rotation of [0, 180]) for (const preset of ['top', '3d'] as const) {
      const board = createBreadboardDefinition('main', columns);
      let nano = createPlacedComponent('arduino-nano', board, []) as ArduinoNanoComponent;
      if (rotation) nano = rotatePlacedComponent(board, nano, [nano]) as ArduinoNanoComponent;
      const footprint = workbenchFootprint(board, [nano]);
      const pose = workbenchCameraPose(footprint, preset, 38, aspect);
      const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 5000);
      camera.position.set(pose.positionMm.x, pose.positionMm.y, pose.positionMm.z);
      camera.lookAt(pose.targetMm.x, pose.targetMm.y, pose.targetMm.z);
      camera.updateMatrixWorld();
      for (const x of [-footprint.widthMm / 2, footprint.widthMm / 2]) for (const z of [-footprint.depthMm / 2, footprint.depthMm / 2]) for (const y of [-4, 24]) {
        const projected = new THREE.Vector3(x + footprint.centerXmm, y, z + footprint.centerZmm).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(projected.z).toBeLessThan(1);
      }
    }
  });
});
