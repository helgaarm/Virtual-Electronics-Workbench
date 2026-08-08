import { describe, expect, it } from 'vitest';
import type { GroundComponent, JumperWireComponent, LedComponent, ResistorComponent } from '../../src/domain/components/types';
import { createBreadboardDefinition, terminalHoleId } from '../../src/domain/physical/breadboard';
import { PHYSICAL_PACKAGES } from '../../src/domain/physical/packages';
import { routeJumperWire } from '../../src/domain/physical/wireRouting';
import { createJumperCurve } from '../../src/workbench/scene/wireGeometry';

function expectCurveToClearLed(
  board: ReturnType<typeof createBreadboardDefinition>,
  route: ReturnType<typeof routeJumperWire>,
  led: LedComponent,
) {
  const curve = createJumperCurve(route)!;
  const ledHoles = Object.values(led.terminalHoleIds)
    .map((holeId) => board.holes.find((hole) => hole.id === holeId)!);
  const center = {
    x: (ledHoles[0].positionMm.x + ledHoles[1].positionMm.x) / 2,
    y: (ledHoles[0].positionMm.y + ledHoles[1].positionMm.y) / 2,
    z: (ledHoles[0].positionMm.z + ledHoles[1].positionMm.z) / 2,
  };
  const packageDefinition = PHYSICAL_PACKAGES.led;
  const bodyRadius = Math.max(packageDefinition.dimensionsMm.x, packageDefinition.dimensionsMm.z) / 2;
  const bodyBottom = center.y + packageDefinition.mountingHeightMm - packageDefinition.dimensionsMm.y / 2;
  const bodyTop = center.y + packageDefinition.mountingHeightMm + packageDefinition.dimensionsMm.y / 2;
  const wireRadius = 0.48;

  for (let index = 0; index <= 300; index += 1) {
    const sample = curve.getPoint(index / 300);
    const overlapsFootprint = Math.hypot(sample.x - center.x, sample.z - center.z) < bodyRadius + wireRadius;
    const overlapsHeight = sample.y + wireRadius > bodyBottom && sample.y - wireRadius < bodyTop;
    expect(overlapsFootprint && overlapsHeight).toBe(false);
  }
}

describe('jumper wire routing', () => {
  const board = createBreadboardDefinition();
  const wire: JumperWireComponent = {
    id: 'W1',
    kind: 'jumper-wire',
    label: 'Jumper',
    color: 'black',
    rotation: 0,
    terminalHoleIds: {
      a: terminalHoleId(board.id, 'A', 1),
      b: terminalHoleId(board.id, 'A', 10),
    },
  };

  it('uses a simple centered arch when the route is clear', () => {
    const route = routeJumperWire(board, wire, [wire]);
    const startHole = board.holes.find((hole) => hole.id === wire.terminalHoleIds.a)!;
    const endHole = board.holes.find((hole) => hole.id === wire.terminalHoleIds.b)!;

    expect(route).toHaveLength(5);
    expect(route[0]).toEqual({ ...startHole.positionMm, y: startHole.positionMm.y + 0.2 });
    expect(route.at(-1)).toEqual({ ...endHole.positionMm, y: endHole.positionMm.y + 0.2 });
    expect(route[2].x).toBeCloseTo((route[0].x + route.at(-1)!.x) / 2);
    expect(route[2].z).toBeCloseTo(route[0].z);
    expect(route[2].y).toBeGreaterThan(route[0].y);
  });

  it('moves laterally and above a component crossing the direct route', () => {
    const led: LedComponent = {
      id: 'D1',
      kind: 'led',
      label: 'LED',
      color: 'red',
      forwardVoltageV: 2,
      onResistanceOhms: 10,
      rotation: 0,
      terminalHoleIds: {
        anode: terminalHoleId(board.id, 'A', 5),
        cathode: terminalHoleId(board.id, 'B', 5),
      },
    };

    const route = routeJumperWire(board, wire, [wire, led]);
    const detour = route[2];

    expect(Math.abs(detour.z - route[0].z)).toBeGreaterThan(2);
    expect(Math.max(...route.map((point) => point.y))).toBeGreaterThan(14);
    expectCurveToClearLed(board, route, led);
  });

  it('escapes around an endpoint-adjacent LED and its legs', () => {
    const endpointLed: LedComponent = {
      id: 'D2',
      kind: 'led',
      label: 'Endpoint LED',
      color: 'red',
      forwardVoltageV: 2,
      onResistanceOhms: 10,
      rotation: 0,
      terminalHoleIds: {
        anode: terminalHoleId(board.id, 'B', 1),
        cathode: terminalHoleId(board.id, 'B', 2),
      },
    };
    const route = routeJumperWire(board, wire, [wire, endpointLed]);

    expect(route.length).toBeGreaterThan(5);
    expect(route[1].y).toBeLessThan(PHYSICAL_PACKAGES.led.mountingHeightMm);
    expect(Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z)).toBeGreaterThan(1.5);
    expectCurveToClearLed(board, route, endpointLed);
  });

  it('orders multiple detours by their projection and clears every package', () => {
    const firstLed: LedComponent = {
      id: 'D4', kind: 'led', label: 'First LED', color: 'yellow',
      forwardVoltageV: 2, onResistanceOhms: 10, rotation: 0,
      terminalHoleIds: {
        anode: terminalHoleId(board.id, 'B', 4),
        cathode: terminalHoleId(board.id, 'B', 5),
      },
    };
    const secondLed: LedComponent = {
      id: 'D5', kind: 'led', label: 'Second LED', color: 'green',
      forwardVoltageV: 2.1, onResistanceOhms: 10, rotation: 0,
      terminalHoleIds: {
        anode: terminalHoleId(board.id, 'B', 7),
        cathode: terminalHoleId(board.id, 'B', 8),
      },
    };

    const route = routeJumperWire(board, wire, [wire, secondLed, firstLed]);

    expect(route).toHaveLength(6);
    expect(route[2].x).toBeLessThan(route[3].x);
    for (const point of route) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(board.widthMm / 2);
      expect(Math.abs(point.z)).toBeLessThanOrEqual(board.depthMm / 2);
    }
    expectCurveToClearLed(board, route, firstLed);
    expectCurveToClearLed(board, route, secondLed);
  });

  it('never routes an endpoint escape below the breadboard surface', () => {
    const ground: GroundComponent = {
      id: 'GND1',
      kind: 'ground',
      label: 'Ground',
      rotation: 0,
      terminalHoleIds: { ground: terminalHoleId(board.id, 'B', 1) },
    };

    const route = routeJumperWire(board, wire, [wire, ground]);

    expect(route.length).toBeGreaterThan(5);
    expect(Math.min(...route.map((point) => point.y))).toBeGreaterThanOrEqual(board.holes[0].positionMm.y);
  });

  it('routes around the full resistor lead envelope, not only its body', () => {
    const crossingWire: JumperWireComponent = {
      ...wire,
      id: 'W2',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'A', 10),
        b: terminalHoleId(board.id, 'J', 10),
      },
    };
    const resistor: ResistorComponent = {
      id: 'R1',
      kind: 'resistor',
      label: 'Resistor',
      rotation: 0,
      resistanceOhms: 220,
      tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'E', 5),
        b: terminalHoleId(board.id, 'E', 10),
      },
    };

    const clearRoute = routeJumperWire(board, crossingWire, [crossingWire]);
    const routed = routeJumperWire(board, crossingWire, [crossingWire, resistor]);

    expect(clearRoute[2].x).toBeCloseTo(routed[0].x);
    expect(Math.abs(routed[2].x - routed[0].x)).toBeGreaterThan(1.5);
    expect(routed[2].y).toBeGreaterThan(10);
  });

  it('ignores components outside the direct route', () => {
    const clearRoute = routeJumperWire(board, wire, [wire]);
    const offPathLed: LedComponent = {
      id: 'D3',
      kind: 'led',
      label: 'Off-path LED',
      color: 'green',
      forwardVoltageV: 2.1,
      onResistanceOhms: 10,
      rotation: 0,
      terminalHoleIds: {
        anode: terminalHoleId(board.id, 'F', 5),
        cathode: terminalHoleId(board.id, 'G', 5),
      },
    };

    expect(routeJumperWire(board, wire, [wire, offPathLed])).toEqual(clearRoute);
  });

  it('returns no route when an endpoint is missing', () => {
    const invalidWire = {
      ...wire,
      terminalHoleIds: { ...wire.terminalHoleIds, b: 'main:missing' },
    };
    const route = routeJumperWire(board, invalidWire, [invalidWire]);

    expect(route).toEqual([]);
    expect(createJumperCurve(route)).toBeUndefined();
  });
});
