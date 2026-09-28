import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSmoothTubeGeometry } from '../../src/workbench/scene/smoothTubeGeometry';
import { createStarterProject } from '../../src/domain/starterProjects';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { routeJumperWires } from '../../src/domain/physical/wireRouting';
import { createJumperCurve, createJumperCurves, createJumperGeometry } from '../../src/workbench/scene/wireGeometry';
import { arduinoNanoProject } from '../../src/domain/starters/arduinoNano';
import { NANO_PROGRAM_IDS } from '../../src/domain/components/arduinoNano';

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

describe('jumper geometry above the breadboard', () => {
  it.each(['digital-thermometer', 'first-press-wins', 'nano-blink', 'nano-button', 'nano-analog'] as const)(
    'keeps tips in their holes and insulation above the board in %s', (id) => {
      const project = createStarterProject(id);
      const board = createBreadboardDefinition(project.board.id, project.board.columns);
      const { components } = project;
      for (const [wireId, route] of routeJumperWires(board, components)) {
        const curve = createJumperCurve(route)!;
        for (let sample = 0; sample <= 1000; sample += 1) {
          const point = curve.getPoint(sample / 1000);
          if (point.y >= board.heightMm / 2) continue;
          const distanceFromHoleMm = Math.min(...[route[0], route.at(-1)!].map(
            (endpoint) => Math.hypot(point.x - endpoint.x, point.z - endpoint.z),
          ));
          expect(distanceFromHoleMm, `${wireId}: below-board wire must be vertical in its hole`)
            .toBeLessThan(0.001);
        }
        for (const selected of [false, true]) {
          const geometry = createJumperGeometry(route, selected)!;
          expect(geometry.insulation.length, `${wireId}: has insulated wire`).toBeGreaterThan(0);
          for (const section of geometry.insulation) {
            section.computeBoundingBox();
            expect(section.boundingBox!.min.y, `${wireId}: insulation clears board`)
              .toBeGreaterThan(board.heightMm / 2 + 0.07);
            section.dispose();
          }
          const vertices = geometry.conductor.getAttribute('position');
          for (let index = 0; index < vertices.count; index += 1) {
            if (vertices.getY(index) >= board.heightMm / 2) continue;
            const distanceFromHoleMm = Math.min(...[route[0], route.at(-1)!].map(
              (endpoint) => Math.hypot(vertices.getX(index) - endpoint.x, vertices.getZ(index) - endpoint.z),
            ));
            expect(distanceFromHoleMm, `${wireId}: bare tip stays within hole`).toBeLessThan(0.26);
          }
          geometry.conductor.dispose();
        }
      }
    },
  );

  it.each(NANO_PROGRAM_IDS)('keeps Nano %s jumpers insulated apart from short insertion tips', (program) => {
    const project = arduinoNanoProject(program);
    const board = createBreadboardDefinition(project.board.id, project.board.columns);
    const nano = project.components.find((component) => component.kind === 'arduino-nano')!;
    const holes = Object.values(nano.terminalHoleIds).map((id) => board.holes.find((hole) => hole.id === id)!);
    const centerX = holes.reduce((sum, hole) => sum + hole.positionMm.x, 0) / holes.length;
    const centerZ = holes.reduce((sum, hole) => sum + hole.positionMm.z, 0) / holes.length;
    for (const [wireId, route] of routeJumperWires(board, project.components)) {
      const curves = createJumperCurves(route)!;
      const bareLength = curves.conductor.getLength() - curves.insulation.reduce((sum, curve) => sum + curve.getLength(), 0);
      expect(bareLength, `${wireId}: only short insertion tips are stripped`).toBeLessThan(3);
      expect(curves.insulation, `${wireId}: continuous insulation`).toHaveLength(1);
      for (const [amount, endpoint] of [[0, route[0]], [1, route.at(-1)!]] as const) {
        const tip = curves.insulation[0].getPoint(amount);
        expect(Math.hypot(tip.x - endpoint.x, tip.z - endpoint.z), `${wireId}: insulation meets its hole`).toBeLessThan(0.01);
      }
      for (const curve of curves.insulation) {
        for (let sample = 0; sample <= 500; sample++) {
          const point = curve.getPoint(sample / 500);
          const overNano = Math.abs(point.x - centerX) < 22.5 + 0.58 && Math.abs(point.z - centerZ) < 9 + 0.58;
          const throughPcb = point.y + 0.58 > board.heightMm / 2 + 3.2 && point.y - 0.58 < board.heightMm / 2 + 4.8;
          expect(overNano && throughPcb, `${wireId}: avoids Nano PCB`).toBe(false);
        }
      }
    }
  });
});
