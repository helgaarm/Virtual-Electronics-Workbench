import type { ComponentKind, PlacedComponent } from '../domain/components/types';
import {
  componentDisplayName,
  LED_TYPICAL_FORWARD_VOLTAGE_V,
  terminalEntries,
} from '../domain/components/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import { railHoleId, terminalHoleId } from '../domain/physical/breadboard';
import { nextQuarterTurn, rotatePoint } from '../domain/physical/geometry';
import { buildOccupancy } from '../domain/physical/occupancy';
import { leadSpanViolation } from '../domain/physical/packages';

function holePairHasValidSpan(
  board: BreadboardDefinition,
  kind: ComponentKind,
  firstHoleId: string,
  secondHoleId: string,
): boolean {
  const first = board.holes.find((hole) => hole.id === firstHoleId);
  const second = board.holes.find((hole) => hole.id === secondHoleId);
  return Boolean(first && second && !leadSpanViolation(kind, Math.hypot(
    second.positionMm.x - first.positionMm.x,
    second.positionMm.z - first.positionMm.z,
  )));
}

function nextLabel(kind: ComponentKind, components: PlacedComponent[]): string {
  const prefix: Record<ComponentKind, string> = {
    'voltage-source': 'V',
    ground: 'GND',
    resistor: 'R',
    led: 'D',
    capacitor: 'C',
    switch: 'S',
    'jumper-wire': 'W',
    ne555: 'U',
    tmp36: 'T',
    'diode-1n4148': 'D', bc547: 'Q', bc557: 'Q', '2n3904': 'Q', '2n3906': 'Q',
    potentiometer: 'RV', 'seven-segment': 'DS', 'four-digit-seven-segment': 'DS',
    '74hc595': 'U', attiny85: 'U',
  };
  let index = 1;
  const labels = new Set(components.map((component) => component.label));
  while (labels.has(`${prefix[kind]}${index}`)) index += 1;
  return `${prefix[kind]}${index}`;
}

function vacant(components: PlacedComponent[], candidates: string[]): string | undefined {
  const occupied = buildOccupancy(components);
  return candidates.find((id) => !occupied.has(id));
}

function vacantTerminal(
  board: BreadboardDefinition,
  components: PlacedComponent[],
  row: 'A' | 'E' | 'F' | 'J',
  start = 1,
): string | undefined {
  return vacant(
    components,
    Array.from({ length: board.columns - start + 1 }, (_, index) =>
      terminalHoleId(board.id, row, start + index),
    ),
  );
}

export function createPlacedComponent(
  kind: ComponentKind,
  board: BreadboardDefinition,
  components: PlacedComponent[],
): PlacedComponent | undefined {
  const label = nextLabel(kind, components);
  const base = {
    id: `${label}-${globalThis.crypto.randomUUID()}`,
    label,
    rotation: 0 as const,
    anchored: true,
  };

  if (kind === 'voltage-source') {
    const occupied = buildOccupancy(components);
    const positiveCandidates = Array.from({ length: board.columns }, (_, index) =>
      railHoleId(board.id, 'top', 'positive', index + 1));
    const negativeCandidates = Array.from({ length: board.columns }, (_, index) =>
      railHoleId(board.id, 'top', 'negative', index + 1));
    const positive = positiveCandidates.find((candidate) =>
      !occupied.has(candidate) && negativeCandidates.some((negativeCandidate) =>
        !occupied.has(negativeCandidate) && holePairHasValidSpan(board, kind, candidate, negativeCandidate)));
    const negative = positive && negativeCandidates.find((candidate) =>
      !occupied.has(candidate) && holePairHasValidSpan(board, kind, positive, candidate));
    if (!positive || !negative) return undefined;
    return { ...base, kind, voltageV: 5, terminalHoleIds: { positive, negative } };
  }
  if (kind === 'ground') {
    const ground = vacant(
      components,
      Array.from({ length: board.columns }, (_, index) =>
        railHoleId(board.id, 'top', 'negative', index + 1),
      ),
    );
    return ground ? { ...base, kind, terminalHoleIds: { ground } } : undefined;
  }

  if (kind === 'ne555') {
    const occupied = buildOccupancy(components);
    for (let column = 1; column <= board.columns - 3; column += 1) {
      const required = [
        ...Array.from({ length: 4 }, (_, index) => terminalHoleId(board.id, 'E', column + index)),
        ...Array.from({ length: 4 }, (_, index) => terminalHoleId(board.id, 'F', column + index)),
      ];
      if (required.some((holeId) => occupied.has(holeId))) continue;
      return {
        ...base,
        kind,
        deviceId: 'ne555n',
        packageId: 'DIP-8',
        simulationModel: 'hybrid-analogue-subcircuit',
        terminalHoleIds: {
          pin1: terminalHoleId(board.id, 'E', column),
          pin2: terminalHoleId(board.id, 'E', column + 1),
          pin3: terminalHoleId(board.id, 'E', column + 2),
          pin4: terminalHoleId(board.id, 'E', column + 3),
          pin5: terminalHoleId(board.id, 'F', column + 3),
          pin6: terminalHoleId(board.id, 'F', column + 2),
          pin7: terminalHoleId(board.id, 'F', column + 1),
          pin8: terminalHoleId(board.id, 'F', column),
        },
      };
    }
    return undefined;
  }

  if (kind === 'tmp36') {
    const occupied = buildOccupancy(components);
    for (let column = 1; column <= board.columns - 2; column += 1) {
      const required = Array.from({ length: 3 }, (_, index) => terminalHoleId(board.id, 'E', column + index));
      if (required.some((holeId) => occupied.has(holeId))) continue;
      return {
        ...base,
        kind,
        deviceId: 'tmp36',
        packageId: 'TO-92-inline',
        simulationModel: 'temperature-controlled-source',
        temperatureC: 25,
        terminalHoleIds: { vs: required[0], vout: required[1], gnd: required[2] },
      };
    }
    return undefined;
  }

  const dipPins = kind === '74hc595' ? 16 : kind === 'attiny85' ? 8
    : kind === 'seven-segment' ? 10 : kind === 'four-digit-seven-segment' ? 12 : 0;
  if (dipPins) {
    const occupied = buildOccupancy(components);
    const perRow = dipPins / 2;
    for (let column = 1; column <= board.columns - perRow + 1; column += 1) {
      const near = Array.from({ length: perRow }, (_, i) => terminalHoleId(board.id, 'E', column + i));
      const far = Array.from({ length: perRow }, (_, i) => terminalHoleId(board.id, 'F', column + i));
      if ([...near, ...far].some((id) => occupied.has(id))) continue;
      const clockwise = [...near, ...far.slice().reverse()];
      if (kind === '74hc595') return { ...base, kind, deviceId: '74hc595', packageId: 'DIP-16', firmwareState: 'electrical-pins', terminalHoleIds: Object.fromEntries(clockwise.map((id, i) => [`pin${i + 1}`, id])) };
      if (kind === 'attiny85') return { ...base, kind, deviceId: 'attiny85', packageId: 'DIP-8', firmwareId: 'thermometer-v1', clockHz: 1_000_000, terminalHoleIds: Object.fromEntries(clockwise.map((id, i) => [`pin${i + 1}`, id])) };
      const names = kind === 'seven-segment'
        ? ['e', 'd', 'common1', 'c', 'dp', 'b', 'a', 'common2', 'f', 'g']
        : ['digit1', 'a', 'f', 'digit2', 'digit3', 'b', 'digit4', 'g', 'c', 'dp', 'd', 'e'];
      return { ...base, kind, packageId: kind === 'seven-segment' ? 'DIP-10' : '12-pin-multiplexed', commonType: 'common-cathode', terminalHoleIds: Object.fromEntries(names.map((name, i) => [name, clockwise[i]])) } as PlacedComponent;
    }
    return undefined;
  }

  if (kind === 'bc547' || kind === 'bc557' || kind === '2n3904' || kind === '2n3906' || kind === 'potentiometer') {
    const occupied = buildOccupancy(components);
    for (let column = 1; column <= board.columns - 2; column += 1) {
      const holes = Array.from({ length: 3 }, (_, i) => terminalHoleId(board.id, 'E', column + i));
      if (holes.some((id) => occupied.has(id))) continue;
      if (kind === 'potentiometer') return { ...base, kind, totalResistanceOhms: 10_000, wiperPosition: 0.5, terminalHoleIds: { a: holes[0], wiper: holes[1], b: holes[2] } };
      const european = kind === 'bc547' || kind === 'bc557';
      return { ...base, kind, deviceId: kind, packageId: 'TO-92-inline', polarity: kind === 'bc547' || kind === '2n3904' ? 'npn' : 'pnp', terminalHoleIds: european ? { collector: holes[0], base: holes[1], emitter: holes[2] } : { emitter: holes[0], base: holes[1], collector: holes[2] } };
    }
    return undefined;
  }

  const first = vacantTerminal(board, components, 'E');
  if (!first) return undefined;
  const firstColumn = Number.parseInt(first.match(/(\d+)$/)?.[1] ?? '1', 10);
  const occupied = buildOccupancy(components);
  const preferredSecondColumn = Math.min(board.columns, firstColumn + (kind === 'resistor' ? 5 : 1));
  const secondCandidates = Array.from({ length: board.columns }, (_, index) =>
    terminalHoleId(board.id, kind === 'switch' ? 'A' : 'E', ((preferredSecondColumn + index - 1) % board.columns) + 1),
  );
  const second = secondCandidates.find((id) => {
    if (id === first || occupied.has(id)) return false;
    return holePairHasValidSpan(board, kind, first, id);
  });
  if (!second) return undefined;

  switch (kind) {
    case 'resistor':
      return {
        ...base,
        kind,
        resistanceOhms: 220,
        tolerancePercent: 5,
        terminalHoleIds: { a: first, b: second },
      };
    case 'led':
      return {
        ...base,
        kind,
        color: 'red',
        forwardVoltageV: LED_TYPICAL_FORWARD_VOLTAGE_V.red,
        onResistanceOhms: 12,
        terminalHoleIds: { anode: first, cathode: second },
      };
    case 'capacitor':
      return {
        ...base,
        kind,
        capacitanceFarads: 100e-6,
        ratedVoltageV: 16,
        terminalHoleIds: { positive: first, negative: second },
      };
    case 'switch':
      return { ...base, kind, closed: false, terminalHoleIds: { a: first, b: second } };
    case 'jumper-wire':
      return { ...base, kind, color: 'blue', terminalHoleIds: { a: first, b: second } };
    case 'diode-1n4148':
      return { ...base, kind, deviceId: '1n4148', packageId: 'DO-35', terminalHoleIds: { anode: first, cathode: second } };
  }
}

export function rotatePlacedComponent(
  board: BreadboardDefinition,
  component: PlacedComponent,
  allComponents: PlacedComponent[],
): PlacedComponent | undefined {
  const terminals = terminalEntries(component);
  if (component.kind === 'ne555' || component.kind === 'tmp36') {
    const holes = terminals.map(([, holeId]) => board.holes.find((hole) => hole.id === holeId));
    if (holes.some((hole) => !hole)) return undefined;
    const positions = holes.map((hole) => hole!);
    const center = positions.reduce(
      (sum, hole) => ({ x: sum.x + hole.positionMm.x, z: sum.z + hole.positionMm.z }),
      { x: 0, z: 0 },
    );
    center.x /= positions.length;
    center.z /= positions.length;
    const occupied = buildOccupancy(allComponents.filter((candidate) => candidate.id !== component.id));
    const selected = new Set<string>();
    const terminalHoleIds: Record<string, string> = {};
    for (let index = 0; index < terminals.length; index += 1) {
      const [terminalName] = terminals[index];
      const original = positions[index];
      const target = {
        x: center.x * 2 - original.positionMm.x,
        z: center.z * 2 - original.positionMm.z,
      };
      const candidate = board.holes
        .filter((hole) => hole.kind === 'terminal' && !occupied.has(hole.id) && !selected.has(hole.id))
        .map((hole) => ({
          hole,
          distance: Math.hypot(hole.positionMm.x - target.x, hole.positionMm.z - target.z),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (!candidate || candidate.distance > board.pitchMm * 0.1) return undefined;
      terminalHoleIds[terminalName] = candidate.hole.id;
      selected.add(candidate.hole.id);
    }
    return {
      ...component,
      rotation: component.rotation === 0 ? 180 : 0,
      terminalHoleIds,
    } as PlacedComponent;
  }
  const rotation = nextQuarterTurn(component.rotation);
  if (terminals.length < 2) return { ...component, rotation };
  const [firstName, firstHoleId] = terminals[0];
  const [secondName, secondHoleId] = terminals[1];
  const firstHole = board.holes.find((hole) => hole.id === firstHoleId);
  const secondHole = board.holes.find((hole) => hole.id === secondHoleId);
  if (!firstHole || !secondHole) return undefined;

  const vector = {
    x: secondHole.positionMm.x - firstHole.positionMm.x,
    y: 0,
    z: secondHole.positionMm.z - firstHole.positionMm.z,
  };
  const rotated = rotatePoint(vector, 90);
  const target = {
    x: firstHole.positionMm.x + rotated.x,
    z: firstHole.positionMm.z + rotated.z,
  };
  const occupied = buildOccupancy(allComponents.filter((candidate) => candidate.id !== component.id));
  const candidate = board.holes
    .filter((hole) => !occupied.has(hole.id) && hole.id !== firstHoleId)
    .map((hole) => ({
      hole,
      distance: Math.hypot(hole.positionMm.x - target.x, hole.positionMm.z - target.z),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!candidate || candidate.distance > board.pitchMm * 0.55) return undefined;

  const terminalHoleIds = {
    ...component.terminalHoleIds,
    [firstName]: firstHoleId,
    [secondName]: candidate.hole.id,
  };
  return { ...component, rotation, terminalHoleIds } as PlacedComponent;
}

export function movePlacedComponent(
  board: BreadboardDefinition,
  component: PlacedComponent,
  anchorHoleId: string,
  allComponents: PlacedComponent[],
): PlacedComponent | undefined {
  const terminals = terminalEntries(component);
  const anchor = board.holes.find((hole) => hole.id === terminals[0]?.[1]);
  const destination = board.holes.find((hole) => hole.id === anchorHoleId);
  if (!anchor || !destination || anchor.kind !== destination.kind) return undefined;

  const occupied = buildOccupancy(allComponents.filter((candidate) => candidate.id !== component.id));
  const selectedHoleIds = new Set<string>();
  const terminalHoleIds: Record<string, string> = {};
  const offset = {
    x: destination.positionMm.x - anchor.positionMm.x,
    z: destination.positionMm.z - anchor.positionMm.z,
  };

  for (const [terminalName, holeId] of terminals) {
    const original = board.holes.find((hole) => hole.id === holeId);
    if (!original) return undefined;
    const target = {
      x: original.positionMm.x + offset.x,
      z: original.positionMm.z + offset.z,
    };
    const candidate = board.holes
      .filter((hole) =>
        hole.kind === original.kind &&
        !occupied.has(hole.id) &&
        !selectedHoleIds.has(hole.id),
      )
      .map((hole) => ({
        hole,
        distance: Math.hypot(hole.positionMm.x - target.x, hole.positionMm.z - target.z),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (!candidate || candidate.distance > board.pitchMm * 0.55) return undefined;
    terminalHoleIds[terminalName] = candidate.hole.id;
    selectedHoleIds.add(candidate.hole.id);
  }

  return { ...component, terminalHoleIds } as PlacedComponent;
}

export function paletteDescription(kind: ComponentKind): string {
  if (kind === 'voltage-source') return '5.00 V DC source';
  if (kind === 'resistor') return 'Axial · 220 Ω';
  if (kind === 'led') return '5 mm · red';
  if (kind === 'capacitor') return 'Radial · 100 µF · 16 V';
  if (kind === 'switch') return 'Tactile · SPST';
  if (kind === 'jumper-wire') return 'Flexible lead';
  if (kind === 'ne555') return 'Integrated Circuits · Timers · DIP-8';
  if (kind === 'tmp36') return 'Temperature sensor · TO-92 · 25 °C';
  if (kind === 'diode-1n4148') return 'Small-signal diode · DO-35 glass';
  if (kind === 'bc547' || kind === '2n3904') return 'NPN transistor · TO-92';
  if (kind === 'bc557' || kind === '2n3906') return 'PNP transistor · TO-92';
  if (kind === 'potentiometer') return 'Input · trimmer · 10 kΩ';
  if (kind === 'seven-segment') return 'Display · common cathode · 1 digit';
  if (kind === 'four-digit-seven-segment') return 'Display · multiplexed · 4 digits';
  if (kind === '74hc595') return 'Logic · serial-in / parallel-out · DIP-16';
  if (kind === 'attiny85') return 'Microcontroller · AVR · DIP-8';
  return componentDisplayName(kind);
}
