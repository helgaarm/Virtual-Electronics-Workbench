import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { topViewDistanceMm } from '../../src/workbench/scene/boardFraming';

describe('top-view board framing', () => {
  it.each([0.5, 1, 2])('keeps a 64-column starter visible at aspect %s', (aspect) => {
    const board = createBreadboardDefinition('main', 64);
    const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 5000);
    camera.position.set(0, topViewDistanceMm(board.widthMm, board.depthMm, camera.fov, aspect), 0.01);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    for (const x of [-board.widthMm / 2, board.widthMm / 2]) {
      for (const z of [-board.depthMm / 2, board.depthMm / 2]) {
        const projected = new THREE.Vector3(x, 20, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
  });
});
