import type { PlacedComponent } from './components/types';
import {
  createDefaultOscilloscopeSettings,
  createDefaultFrequencyCounterSettings,
  createDefaultLogicAnalyserSettings,
  createDefaultSignalGeneratorSettings,
  type AnalysisInstrumentId,
  type FrequencyCounterSettings,
  type LogicAnalyserSettings,
  type OscilloscopeSettings,
  type SignalGeneratorSettings,
} from './instruments/types';
import { railHoleId, terminalHoleId } from './physical/breadboard';
import type { PcbProject } from './pcb/types';

export const PROJECT_SCHEMA_VERSION = 10 as const;
export const MAX_PROJECT_PROBES = 16;
export const SIMULATION_TIME_STEPS_SECONDS = [
  0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05,
] as const;
export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export type ProbeTerminal = 'positive' | 'reference';

export interface MeasurementProbe {
  id: string;
  label: string;
  instrumentId: 'multimeter';
  positiveHoleId?: string;
  referenceHoleId?: string;
}

export interface AnalysisSettings {
  activeInstrument: AnalysisInstrumentId;
  activeProbeTerminal: ProbeTerminal;
  selectedProbeId?: string;
}

export interface SimulationSettings {
  timeStepSeconds: number;
  speed: number;
}

export interface WorkbenchProject {
  version: typeof PROJECT_SCHEMA_VERSION;
  revision: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  board: {
    id: string;
    columns: number;
  };
  powerOn: boolean;
  workspace: 'build' | 'analysis' | 'pcb';
  pcb?: PcbProject;
  components: PlacedComponent[];
  probes: MeasurementProbe[];
  analysis: AnalysisSettings;
  simulation: SimulationSettings;
  oscilloscope: OscilloscopeSettings;
  signalGenerator: SignalGeneratorSettings;
  frequencyCounter: FrequencyCounterSettings;
  logicAnalyser: LogicAnalyserSettings;
  view: {
    cameraPreset: '3d' | 'top';
    showConnections: boolean;
  };
}

function newProjectId(): string {
  return `project-${globalThis.crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyProject(name = 'Untitled workbench'): WorkbenchProject {
  const now = nowIso();
  return {
    version: PROJECT_SCHEMA_VERSION,
    revision: 0,
    id: newProjectId(),
    name,
    createdAt: now,
    updatedAt: now,
    board: { id: 'main', columns: 30 },
    powerOn: false,
    workspace: 'build',
    components: [],
    probes: [],
    analysis: {
      activeInstrument: 'multimeter',
      activeProbeTerminal: 'positive',
    },
    simulation: {
      timeStepSeconds: 0.005,
      speed: 1,
    },
    oscilloscope: createDefaultOscilloscopeSettings(),
    signalGenerator: createDefaultSignalGeneratorSettings(),
    frequencyCounter: createDefaultFrequencyCounterSettings(),
    logicAnalyser: createDefaultLogicAnalyserSettings(),
    view: { cameraPreset: '3d', showConnections: false },
  };
}

export function createLedExampleProject(): WorkbenchProject {
  const project = createEmptyProject('Light an LED');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'V1',
      kind: 'voltage-source',
      label: 'V1',
      rotation: 0,
      voltageV: 5,
      terminalHoleIds: {
        positive: railHoleId(boardId, 'top', 'positive', 1),
        negative: railHoleId(boardId, 'top', 'negative', 1),
      },
    },
    {
      id: 'GND1',
      kind: 'ground',
      label: 'GND',
      rotation: 0,
      terminalHoleIds: {
        ground: railHoleId(boardId, 'top', 'negative', 2),
      },
    },
    {
      id: 'S1',
      kind: 'switch',
      label: 'S1',
      rotation: 0,
      closed: true,
      terminalHoleIds: {
        a: railHoleId(boardId, 'top', 'positive', 5),
        b: terminalHoleId(boardId, 'A', 5),
      },
    },
    {
      id: 'R1',
      kind: 'resistor',
      label: 'R1',
      rotation: 0,
      resistanceOhms: 220,
      tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 5),
        b: terminalHoleId(boardId, 'E', 10),
      },
    },
    {
      id: 'D1',
      kind: 'led',
      label: 'D1',
      rotation: 0,
      color: 'red',
      forwardVoltageV: 1.9,
      onResistanceOhms: 12,
      terminalHoleIds: {
        anode: terminalHoleId(boardId, 'A', 10),
        cathode: terminalHoleId(boardId, 'A', 11),
      },
    },
    {
      id: 'W1',
      kind: 'jumper-wire',
      label: 'W1',
      rotation: 0,
      color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 11),
        b: railHoleId(boardId, 'top', 'negative', 10),
      },
    },
  ];

  return {
    ...project,
    powerOn: true,
    components,
    probes: [
      {
        id: 'probe-dc-1',
        label: 'DC probe',
        instrumentId: 'multimeter',
        positiveHoleId: terminalHoleId(boardId, 'A', 10),
        referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
      },
    ],
    analysis: {
      ...project.analysis,
      selectedProbeId: 'probe-dc-1',
    },
  };
}
