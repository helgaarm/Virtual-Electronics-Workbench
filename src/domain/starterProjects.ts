import type { PlacedComponent } from './components/types';
import { railHoleId, terminalHoleId } from './physical/breadboard';
import { createEmptyProject, createLedExampleProject, type WorkbenchProject } from './project';

export const STARTER_PROJECTS = [
  {
    id: 'switched-led',
    name: 'Switched LED',
    description: 'A classic current-limited red LED controlled by a tactile switch.',
  },
  {
    id: 'voltage-divider',
    name: 'Voltage divider',
    description: 'Two equal resistors divide a 5 V supply into a measured 2.5 V midpoint.',
  },
  {
    id: 'series-leds',
    name: 'LEDs in series',
    description: 'Two LEDs share one current-limiting resistor in a single series loop.',
  },
  {
    id: 'parallel-indicators',
    name: 'Parallel indicators',
    description: 'Independent red and green LED branches demonstrate a parallel circuit.',
  },
] as const;

export type StarterProjectId = (typeof STARTER_PROJECTS)[number]['id'];

function voltageDividerProject(): WorkbenchProject {
  const project = createEmptyProject('Voltage divider');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'V1', kind: 'voltage-source', label: 'V1', rotation: 0, voltageV: 5,
      terminalHoleIds: {
        positive: railHoleId(boardId, 'top', 'positive', 1),
        negative: railHoleId(boardId, 'top', 'negative', 1),
      },
    },
    {
      id: 'GND1', kind: 'ground', label: 'GND', rotation: 0,
      terminalHoleIds: { ground: railHoleId(boardId, 'top', 'negative', 2) },
    },
    {
      id: 'W1', kind: 'jumper-wire', label: 'W1', rotation: 0, color: 'red',
      terminalHoleIds: {
        a: railHoleId(boardId, 'top', 'positive', 5),
        b: terminalHoleId(boardId, 'A', 5),
      },
    },
    {
      id: 'R1', kind: 'resistor', label: 'R1', rotation: 0,
      resistanceOhms: 1_000, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 5),
        b: terminalHoleId(boardId, 'E', 10),
      },
    },
    {
      id: 'R2', kind: 'resistor', label: 'R2', rotation: 0,
      resistanceOhms: 1_000, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'A', 10),
        b: terminalHoleId(boardId, 'A', 15),
      },
    },
    {
      id: 'W2', kind: 'jumper-wire', label: 'W2', rotation: 0, color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 15),
        b: railHoleId(boardId, 'top', 'negative', 10),
      },
    },
  ];
  return {
    ...project,
    powerOn: true,
    components,
    probes: [{
      id: 'probe-divider',
      label: 'Divider midpoint',
      instrumentId: 'multimeter',
      positiveHoleId: terminalHoleId(boardId, 'C', 10),
      referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
    }],
    analysis: { ...project.analysis, selectedProbeId: 'probe-divider' },
  };
}

function seriesLedsProject(): WorkbenchProject {
  const project = createEmptyProject('LEDs in series');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'V1', kind: 'voltage-source', label: 'V1', rotation: 0, voltageV: 5,
      terminalHoleIds: {
        positive: railHoleId(boardId, 'top', 'positive', 1),
        negative: railHoleId(boardId, 'top', 'negative', 1),
      },
    },
    {
      id: 'GND1', kind: 'ground', label: 'GND', rotation: 0,
      terminalHoleIds: { ground: railHoleId(boardId, 'top', 'negative', 2) },
    },
    {
      id: 'W1', kind: 'jumper-wire', label: 'W1', rotation: 0, color: 'red',
      terminalHoleIds: {
        a: railHoleId(boardId, 'top', 'positive', 5),
        b: terminalHoleId(boardId, 'A', 5),
      },
    },
    {
      id: 'R1', kind: 'resistor', label: 'R1', rotation: 0,
      resistanceOhms: 180, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 5),
        b: terminalHoleId(boardId, 'E', 10),
      },
    },
    {
      id: 'D1', kind: 'led', label: 'D1', rotation: 0, color: 'red',
      forwardVoltageV: 1.9, onResistanceOhms: 12,
      terminalHoleIds: {
        anode: terminalHoleId(boardId, 'A', 10),
        cathode: terminalHoleId(boardId, 'A', 11),
      },
    },
    {
      id: 'D2', kind: 'led', label: 'D2', rotation: 0, color: 'yellow',
      forwardVoltageV: 2, onResistanceOhms: 12,
      terminalHoleIds: {
        anode: terminalHoleId(boardId, 'E', 11),
        cathode: terminalHoleId(boardId, 'E', 12),
      },
    },
    {
      id: 'W2', kind: 'jumper-wire', label: 'W2', rotation: 0, color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'A', 12),
        b: railHoleId(boardId, 'top', 'negative', 10),
      },
    },
  ];
  return {
    ...project,
    powerOn: true,
    components,
    probes: [{
      id: 'probe-series',
      label: 'Series string input',
      instrumentId: 'multimeter',
      positiveHoleId: terminalHoleId(boardId, 'C', 10),
      referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
    }],
    analysis: { ...project.analysis, selectedProbeId: 'probe-series' },
  };
}

function parallelIndicatorsProject(): WorkbenchProject {
  const project = createEmptyProject('Parallel LED indicators');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'V1', kind: 'voltage-source', label: 'V1', rotation: 0, voltageV: 5,
      terminalHoleIds: {
        positive: railHoleId(boardId, 'top', 'positive', 1),
        negative: railHoleId(boardId, 'top', 'negative', 1),
      },
    },
    {
      id: 'GND1', kind: 'ground', label: 'GND', rotation: 0,
      terminalHoleIds: { ground: railHoleId(boardId, 'top', 'negative', 2) },
    },
    {
      id: 'W1', kind: 'jumper-wire', label: 'W1', rotation: 0, color: 'red',
      terminalHoleIds: {
        a: railHoleId(boardId, 'top', 'positive', 4),
        b: terminalHoleId(boardId, 'A', 4),
      },
    },
    {
      id: 'R1', kind: 'resistor', label: 'R1', rotation: 0,
      resistanceOhms: 330, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 4),
        b: terminalHoleId(boardId, 'E', 9),
      },
    },
    {
      id: 'D1', kind: 'led', label: 'D1', rotation: 0, color: 'red',
      forwardVoltageV: 1.9, onResistanceOhms: 12,
      terminalHoleIds: {
        anode: terminalHoleId(boardId, 'A', 9),
        cathode: terminalHoleId(boardId, 'A', 10),
      },
    },
    {
      id: 'W2', kind: 'jumper-wire', label: 'W2', rotation: 0, color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 10),
        b: railHoleId(boardId, 'top', 'negative', 4),
      },
    },
    {
      id: 'W3', kind: 'jumper-wire', label: 'W3', rotation: 0, color: 'orange',
      terminalHoleIds: {
        a: railHoleId(boardId, 'top', 'positive', 14),
        b: terminalHoleId(boardId, 'F', 20),
      },
    },
    {
      id: 'R2', kind: 'resistor', label: 'R2', rotation: 0,
      resistanceOhms: 330, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'J', 20),
        b: terminalHoleId(boardId, 'J', 25),
      },
    },
    {
      id: 'D2', kind: 'led', label: 'D2', rotation: 0, color: 'green',
      forwardVoltageV: 2.1, onResistanceOhms: 12,
      terminalHoleIds: {
        anode: terminalHoleId(boardId, 'F', 25),
        cathode: terminalHoleId(boardId, 'F', 26),
      },
    },
    {
      id: 'W4', kind: 'jumper-wire', label: 'W4', rotation: 0, color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'J', 26),
        b: railHoleId(boardId, 'top', 'negative', 14),
      },
    },
  ];
  return {
    ...project,
    powerOn: true,
    components,
    probes: [{
      id: 'probe-parallel',
      label: 'Red branch input',
      instrumentId: 'multimeter',
      positiveHoleId: terminalHoleId(boardId, 'C', 9),
      referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
    }],
    analysis: { ...project.analysis, selectedProbeId: 'probe-parallel' },
  };
}

const STARTER_FACTORIES: Record<StarterProjectId, () => WorkbenchProject> = {
  'switched-led': createLedExampleProject,
  'voltage-divider': voltageDividerProject,
  'series-leds': seriesLedsProject,
  'parallel-indicators': parallelIndicatorsProject,
};

export function createStarterProject(id: StarterProjectId): WorkbenchProject {
  return STARTER_FACTORIES[id]();
}
