import type { PlacedComponent } from '../domain/components/types';
import { terminalEntries } from '../domain/components/types';
import { MAX_PROJECT_PROBES, PROJECT_SCHEMA_VERSION, type WorkbenchProject } from '../domain/project';
import { createBreadboardDefinition } from '../domain/physical/breadboard';
import { validateOccupancy } from '../domain/physical/occupancy';

export class UnsupportedProjectVersionError extends Error {}

export class ProjectValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProjectValidationError(path, 'must be an object');
  return value;
}

function stringValue(value: unknown, path: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProjectValidationError(path, 'must be a non-empty string');
  }
  if (value.length > maxLength) throw new ProjectValidationError(path, `must be at most ${maxLength} characters`);
  return value;
}

const UNSAFE_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function identifier(value: unknown, path: string, maxLength = 128): string {
  const result = stringValue(value, path, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) || UNSAFE_RECORD_KEYS.has(result)) {
    throw new ProjectValidationError(path, 'must be a safe identifier');
  }
  return result;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ProjectValidationError(path, 'must be a boolean');
  return value;
}

function finiteNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ProjectValidationError(path, `must be a finite number from ${minimum} to ${maximum}`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = finiteNumber(value, path, minimum, maximum);
  if (!Number.isInteger(result)) throw new ProjectValidationError(path, 'must be an integer');
  return result;
}

function enumValue<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ProjectValidationError(path, `must be one of ${values.join(', ')}`);
  }
  return value as T;
}

function isoDate(value: unknown, path: string): string {
  const result = stringValue(value, path, 40);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== result) {
    throw new ProjectValidationError(path, 'must be a canonical ISO date');
  }
  return result;
}

function terminals<T extends string>(
  value: unknown,
  path: string,
  names: readonly T[],
): Record<T, string> {
  const source = record(value, path);
  return Object.fromEntries(
    names.map((name) => [name, stringValue(source[name], `${path}.${name}`, 160)]),
  ) as Record<T, string>;
}

const ROTATIONS = [0, 90, 180, 270] as const;
const LED_COLORS = ['red', 'green', 'yellow', 'blue', 'white'] as const;
const WIRE_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'orange'] as const;

function rotationValue(value: unknown, path: string): (typeof ROTATIONS)[number] {
  if (typeof value !== 'number' || !ROTATIONS.includes(value as (typeof ROTATIONS)[number])) {
    throw new ProjectValidationError(path, 'must be one of 0, 90, 180, 270');
  }
  return value as (typeof ROTATIONS)[number];
}

function parseComponent(value: unknown, index: number): PlacedComponent {
  const path = `components[${index}]`;
  const source = record(value, path);
  const kind = enumValue(source.kind, `${path}.kind`, [
    'voltage-source', 'ground', 'resistor', 'led', 'capacitor', 'switch', 'jumper-wire',
  ] as const);
  const base = {
    id: identifier(source.id, `${path}.id`),
    label: stringValue(source.label, `${path}.label`, 40),
    rotation: rotationValue(source.rotation, `${path}.rotation`),
    ...(source.anchored === undefined
      ? {}
      : { anchored: booleanValue(source.anchored, `${path}.anchored`) }),
  };

  switch (kind) {
    case 'voltage-source':
      return {
        ...base,
        kind,
        voltageV: finiteNumber(source.voltageV, `${path}.voltageV`, 0, 100),
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['positive', 'negative']),
      };
    case 'ground':
      return {
        ...base,
        kind,
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['ground']),
      };
    case 'resistor':
      return {
        ...base,
        kind,
        resistanceOhms: finiteNumber(source.resistanceOhms, `${path}.resistanceOhms`, 0.1, 99e9),
        tolerancePercent: finiteNumber(source.tolerancePercent, `${path}.tolerancePercent`, 0.01, 20),
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['a', 'b']),
      };
    case 'led':
      return {
        ...base,
        kind,
        color: enumValue(source.color, `${path}.color`, LED_COLORS),
        forwardVoltageV: finiteNumber(source.forwardVoltageV, `${path}.forwardVoltageV`, 0.1, 20),
        onResistanceOhms: finiteNumber(source.onResistanceOhms, `${path}.onResistanceOhms`, 0.01, 1e6),
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['anode', 'cathode']),
      };
    case 'capacitor':
      return {
        ...base,
        kind,
        capacitanceFarads: finiteNumber(
          source.capacitanceFarads,
          `${path}.capacitanceFarads`,
          1e-12,
          10,
        ),
        ratedVoltageV: finiteNumber(source.ratedVoltageV, `${path}.ratedVoltageV`, 1, 1_000),
        terminalHoleIds: terminals(
          source.terminalHoleIds,
          `${path}.terminalHoleIds`,
          ['positive', 'negative'],
        ),
      };
    case 'switch':
      return {
        ...base,
        kind,
        closed: booleanValue(source.closed, `${path}.closed`),
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['a', 'b']),
      };
    case 'jumper-wire':
      return {
        ...base,
        kind,
        color: enumValue(source.color, `${path}.color`, WIRE_COLORS),
        terminalHoleIds: terminals(source.terminalHoleIds, `${path}.terminalHoleIds`, ['a', 'b']),
      };
  }
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new ProjectValidationError(path, 'must contain unique IDs');
  }
}

export function migrateProjectDocument(value: unknown): WorkbenchProject {
  const source = record(value, 'project');
  const sourceVersion = integer(source.version, 'version', 1, Number.MAX_SAFE_INTEGER);
  if (sourceVersion < 1 || sourceVersion > PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(
      `Project version ${sourceVersion} is not supported by version ${PROJECT_SCHEMA_VERSION}.`,
    );
  }

  const boardSource = record(source.board, 'board');
  const board = {
    id: identifier(boardSource.id, 'board.id', 64),
    columns: integer(boardSource.columns, 'board.columns', 10, 64),
  };
  if (!Array.isArray(source.components) || source.components.length > 100) {
    throw new ProjectValidationError('components', 'must be an array with at most 100 entries');
  }
  if (!Array.isArray(source.probes) || source.probes.length > MAX_PROJECT_PROBES) {
    throw new ProjectValidationError('probes', `must be an array with at most ${MAX_PROJECT_PROBES} entries`);
  }
  const components = source.components.map(parseComponent);
  unique(components.map((component) => component.id), 'components');

  const probes = source.probes.map((value, index) => {
    const path = `probes[${index}]`;
    const probe = record(value, path);
    const positiveHoleId = probe.positiveHoleId === undefined
      ? undefined
      : stringValue(probe.positiveHoleId, `${path}.positiveHoleId`, 160);
    const referenceHoleId = probe.referenceHoleId === undefined
      ? undefined
      : stringValue(probe.referenceHoleId, `${path}.referenceHoleId`, 160);
    return {
      id: identifier(probe.id, `${path}.id`),
      label: stringValue(probe.label, `${path}.label`, 80),
      instrumentId: sourceVersion < 3
        ? 'multimeter' as const
        : enumValue(probe.instrumentId, `${path}.instrumentId`, ['multimeter'] as const),
      ...(positiveHoleId ? { positiveHoleId } : {}),
      ...(referenceHoleId ? { referenceHoleId } : {}),
    };
  });
  unique(probes.map((probe) => probe.id), 'probes');

  const viewSource = record(source.view, 'view');
  const analysis = sourceVersion < 3
    ? {
        activeInstrument: 'multimeter' as const,
        activeProbeTerminal: 'positive' as const,
        ...(probes[0] ? { selectedProbeId: probes[0].id } : {}),
      }
    : (() => {
        const analysisSource = record(source.analysis, 'analysis');
        const selectedProbeId = analysisSource.selectedProbeId === undefined
          ? undefined
          : identifier(analysisSource.selectedProbeId, 'analysis.selectedProbeId');
        return {
          activeInstrument: enumValue(
            analysisSource.activeInstrument,
            'analysis.activeInstrument',
            ['multimeter'] as const,
          ),
          activeProbeTerminal: enumValue(
            analysisSource.activeProbeTerminal,
            'analysis.activeProbeTerminal',
            ['positive', 'reference'] as const,
          ),
          ...(selectedProbeId ? { selectedProbeId } : {}),
        };
      })();
  if (analysis.selectedProbeId && !probes.some((probe) => probe.id === analysis.selectedProbeId)) {
    throw new ProjectValidationError('analysis.selectedProbeId', 'must reference an existing probe');
  }
  const simulation = sourceVersion < 4
    ? { timeStepSeconds: 0.005, speed: 1 }
    : (() => {
        const simulationSource = record(source.simulation, 'simulation');
        return {
          timeStepSeconds: finiteNumber(
            simulationSource.timeStepSeconds,
            'simulation.timeStepSeconds',
            1e-6,
            1,
          ),
          speed: finiteNumber(simulationSource.speed, 'simulation.speed', 0.1, 10),
        };
      })();
  const project: WorkbenchProject = {
    version: PROJECT_SCHEMA_VERSION,
    revision: sourceVersion === 1 ? 0 : integer(source.revision, 'revision', 0, Number.MAX_SAFE_INTEGER),
    id: identifier(source.id, 'id'),
    name: stringValue(source.name, 'name', 200),
    createdAt: isoDate(source.createdAt, 'createdAt'),
    updatedAt: isoDate(source.updatedAt, 'updatedAt'),
    board,
    powerOn: booleanValue(source.powerOn, 'powerOn'),
    workspace: enumValue(source.workspace, 'workspace', ['build', 'analysis'] as const),
    components,
    probes,
    analysis,
    simulation,
    view: {
      cameraPreset: enumValue(viewSource.cameraPreset, 'view.cameraPreset', ['3d', 'top'] as const),
      showConnections: booleanValue(viewSource.showConnections, 'view.showConnections'),
    },
  };

  const definition = createBreadboardDefinition(board.id, board.columns);
  const validHoleIds = new Set(definition.holes.map((hole) => hole.id));
  for (const component of components) {
    for (const [terminal, holeId] of terminalEntries(component)) {
      if (!validHoleIds.has(holeId)) {
        throw new ProjectValidationError(`components.${component.id}.${terminal}`, 'references an unknown hole');
      }
    }
  }
  const occupancyIssue = validateOccupancy(definition, components)[0];
  if (occupancyIssue) throw new ProjectValidationError('components', occupancyIssue.message);
  for (const probe of probes) {
    if (
      (probe.positiveHoleId && !validHoleIds.has(probe.positiveHoleId))
      || (probe.referenceHoleId && !validHoleIds.has(probe.referenceHoleId))
    ) {
      throw new ProjectValidationError(`probes.${probe.id}`, 'references an unknown hole');
    }
  }

  return project;
}
