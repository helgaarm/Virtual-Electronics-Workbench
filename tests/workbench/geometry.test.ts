import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSmoothTubeGeometry } from '../../src/workbench/scene/smoothTubeGeometry';

describe('smooth component lead geometry', () => {
  it('creates a finite, rounded tube through a three-point bend', () => {
    const geometry = createSmoothTubeGeometry([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(3, 4, 0),
    ], 0.25);
    const positions = geometry.getAttribute('position');

    expect(positions.count).toBeGreaterThan(500);
    for (let index = 0; index < positions.array.length; index += 1) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    expect(geometry.parameters.radialSegments).toBe(16);
    geometry.dispose();
  });
});
