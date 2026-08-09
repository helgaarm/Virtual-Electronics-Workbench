import { describe, expect, it } from 'vitest';
import { terminalEntries, type CapacitorComponent, type GroundComponent, type JumperWireComponent, type LedComponent, type PlacedComponent, type ResistorComponent } from '../../src/domain/components/types';
import { createBreadboardDefinition, terminalHoleId } from '../../src/domain/physical/breadboard';
import { PHYSICAL_PACKAGES } from '../../src/domain/physical/packages';
import { routeJumperWire, routeJumperWires } from '../../src/domain/physical/wireRouting';
import { createJumperCurve } from '../../src/workbench/scene/wireGeometry';

function expectCurveToClearComponent(
  board: ReturnType<typeof createBreadboardDefinition>,
  route: ReturnType<typeof routeJumperWire>,
  component: Exclude<PlacedComponent, JumperWireComponent>,
) {
  const curve = createJumperCurve(route)!;
  const componentHoles = terminalEntries(component)
    .map(([, holeId]) => holeId)
    .map((holeId) => board.holes.find((hole) => hole.id === holeId)!);
  const center = {
    x: componentHoles.reduce((sum, hole) => sum + hole.positionMm.x, 0) / componentHoles.length,
    y: componentHoles.reduce((sum, hole) => sum + hole.positionMm.y, 0) / componentHoles.length,
    z: componentHoles.reduce((sum, hole) => sum + hole.positionMm.z, 0) / componentHoles.length,
  };
  const packageDefinition = PHYSICAL_PACKAGES[component.kind];
  const bodyRadius = Math.max(packageDefinition.dimensionsMm.x, packageDefinition.dimensionsMm.z) / 2;
  const bodyBottom = center.y + packageDefinition.mountingHeightMm - packageDefinition.dimensionsMm.y / 2;
  const bodyTop = center.y + packageDefinition.mountingHeightMm + packageDefinition.dimensionsMm.y / 2;
  const wireRadius = 0.58;

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
    expect(route[0]).toEqual({ ...startHole.positionMm, y: startHole.positionMm.y + 0.1 });
    expect(route.at(-1)).toEqual({ ...endHole.positionMm, y: endHole.positionMm.y + 0.1 });
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
    expectCurveToClearComponent(board, route, led);
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

    expect(route.length).toBeGreaterThanOrEqual(5);
    expect(route[1].y).toBeLessThan(PHYSICAL_PACKAGES.led.mountingHeightMm);
    expect(Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z)).toBeGreaterThan(1.5);
    expectCurveToClearComponent(board, route, endpointLed);
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
    expectCurveToClearComponent(board, route, firstLed);
    expectCurveToClearComponent(board, route, secondLed);
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

    expect(route.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...route.map((point) => point.y))).toBeGreaterThanOrEqual(board.holes[0].positionMm.y);
  });

  it('escapes beneath and around a tall capacitor beside a wire endpoint', () => {
    const capacitor: CapacitorComponent = {
      id: 'C-ENDPOINT',
      kind: 'capacitor',
      label: 'Nearby capacitor',
      rotation: 0,
      capacitanceFarads: 100e-6,
      ratedVoltageV: 16,
      terminalHoleIds: {
        positive: terminalHoleId(board.id, 'A', 5),
        negative: terminalHoleId(board.id, 'A', 6),
      },
    };
    const nearbyWire: JumperWireComponent = {
      ...wire,
      id: 'W-CAPACITOR',
      color: 'blue',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'B', 5),
        b: terminalHoleId(board.id, 'E', 10),
      },
    };
    const route = routeJumperWire(board, nearbyWire, [capacitor, nearbyWire]);

    expect(route.length).toBeGreaterThanOrEqual(5);
    expectCurveToClearComponent(board, route, capacitor);

    const crossingWire: JumperWireComponent = {
      ...wire,
      id: 'W-CAPACITOR-CROSSING',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'A', 1),
        b: terminalHoleId(board.id, 'A', 10),
      },
    };
    expectCurveToClearComponent(
      board,
      routeJumperWire(board, crossingWire, [capacitor, crossingWire]),
      capacitor,
    );
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

  it('does not create a long low-level loop around a resistor lead envelope near an endpoint', () => {
    const adjacentWire: JumperWireComponent = {
      ...wire,
      id: 'W3',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'A', 1),
        b: terminalHoleId(board.id, 'D', 10),
      },
    };
    const resistor: ResistorComponent = {
      id: 'R2',
      kind: 'resistor',
      label: 'Nearby resistor',
      rotation: 0,
      resistanceOhms: 220,
      tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'E', 5),
        b: terminalHoleId(board.id, 'E', 10),
      },
    };

    const route = routeJumperWire(board, adjacentWire, [adjacentWire, resistor]);
    const endpoint = route.at(-1)!;

    expect(route).toHaveLength(5);
    expect(route.at(-2)?.x).toBeCloseTo(endpoint.x);
    expect(route.at(-2)?.z).toBeCloseTo(endpoint.z);
    expect(route.at(-2)?.y).toBeGreaterThan(endpoint.y + 5);
    expectCurveToClearComponent(board, route, resistor);
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

  it('routes a later jumper around an already-routed crossing jumper', () => {
    const first: JumperWireComponent = {
      ...wire,
      id: 'W-CROSS-1',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'E', 1),
        b: terminalHoleId(board.id, 'E', 10),
      },
    };
    const second: JumperWireComponent = {
      ...wire,
      id: 'W-CROSS-2',
      color: 'red',
      terminalHoleIds: {
        a: terminalHoleId(board.id, 'A', 5),
        b: terminalHoleId(board.id, 'J', 5),
      },
    };
    const routes = routeJumperWires(board, [first, second]);
    const firstRoute = routes.get(first.id)!;
    const secondRoute = routes.get(second.id)!;
    const firstCurve = createJumperCurve(firstRoute)!;
    const secondCurve = createJumperCurve(secondRoute)!;
    let minimumDistanceMm = Number.POSITIVE_INFINITY;
    for (let firstIndex = 0; firstIndex <= 160; firstIndex += 1) {
      const firstPoint = firstCurve.getPoint(firstIndex / 160);
      for (let secondIndex = 0; secondIndex <= 160; secondIndex += 1) {
        const secondPoint = secondCurve.getPoint(secondIndex / 160);
        minimumDistanceMm = Math.min(minimumDistanceMm, firstPoint.distanceTo(secondPoint));
      }
    }

    expect(Math.max(...secondRoute.map((point) => point.y)))
      .toBeGreaterThan(Math.max(...firstRoute.map((point) => point.y)));
    expect(minimumDistanceMm).toBeGreaterThan(1);
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
