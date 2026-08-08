import type { ComponentKind, PlacedComponent } from '../domain/components/types';
import { componentDisplayName, terminalEntries } from '../domain/components/types';
import type { BreadboardDefinition } from '../domain/physical/breadboard';
import { railHoleId, terminalHoleId } from '../domain/physical/breadboard';
import { nextQuarterTurn, rotatePoint } from '../domain/physical/geometry';
import { buildOccupancy } from '../domain/physical/occupancy';

function nextLabel(kind: ComponentKind, components: PlacedComponent[]): string {
  const prefix: Record<ComponentKind, string> = {
    'voltage-source': 'V',
    ground: 'GND',
    resistor: 'R',
    led: 'D',
    switch: 'S',
    'jumper-wire': 'W',
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
  const base = { id: `${label}-${globalThis.crypto.randomUUID()}`, label, rotation: 0 as const };

  if (kind === 'voltage-source') {
    const positive = vacant(
      components,
      Array.from({ length: board.columns }, (_, index) =>
        railHoleId(board.id, 'top', 'positive', index + 1),
      ),
    );
    const negative = vacant(
      components,
      Array.from({ length: board.columns }, (_, index) =>
        railHoleId(board.id, 'top', 'negative', index + 1),
      ),
    );
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

  const first = vacantTerminal(board, components, 'E');
  if (!first) return undefined;
  const firstColumn = Number.parseInt(first.match(/(\d+)$/)?.[1] ?? '1', 10);
  const occupied = buildOccupancy(components);
  const preferredSecondColumn = Math.min(board.columns, firstColumn + (kind === 'resistor' ? 5 : 1));
  const secondCandidates = Array.from({ length: board.columns }, (_, index) =>
    terminalHoleId(board.id, kind === 'switch' ? 'A' : 'E', ((preferredSecondColumn + index - 1) % board.columns) + 1),
  );
  const second = secondCandidates.find((id) => id !== first && !occupied.has(id));
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
        forwardVoltageV: 1.9,
        onResistanceOhms: 12,
        terminalHoleIds: { anode: first, cathode: second },
      };
    case 'switch':
      return { ...base, kind, closed: false, terminalHoleIds: { a: first, b: second } };
    case 'jumper-wire':
      return { ...base, kind, color: 'blue', terminalHoleIds: { a: first, b: second } };
  }
}

export function rotatePlacedComponent(
  board: BreadboardDefinition,
  component: PlacedComponent,
  allComponents: PlacedComponent[],
): PlacedComponent | undefined {
  const terminals = terminalEntries(component);
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

export function paletteDescription(kind: ComponentKind): string {
  if (kind === 'voltage-source') return '5.00 V DC source';
  if (kind === 'resistor') return 'Axial · 220 Ω';
  if (kind === 'led') return '5 mm · red';
  if (kind === 'switch') return 'Tactile · SPST';
  if (kind === 'jumper-wire') return 'Flexible lead';
  return componentDisplayName(kind);
}
