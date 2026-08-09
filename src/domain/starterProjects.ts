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
  {
    id: 'rc-charge-discharge',
    name: 'RC charge and discharge',
    description: 'A square-wave generator drives a 10 kΩ / 100 µF RC circuit with CH1 and CH2 attached.',
  },
  {
    id: 'ne555-astable',
    name: 'NE555 Astable Oscillator',
    description: 'A real NE555 subcircuit charges and discharges a timing capacitor; CH1 and CH2 show the resulting waveforms.',
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

function rcChargeDischargeProject(): WorkbenchProject {
  const project = createEmptyProject('RC charge and discharge');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'GND1', kind: 'ground', label: 'GND', rotation: 0,
      terminalHoleIds: { ground: railHoleId(boardId, 'top', 'negative', 2) },
    },
    {
      id: 'R1', kind: 'resistor', label: 'R1', rotation: 0,
      resistanceOhms: 10_000, tolerancePercent: 5,
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 5),
        b: terminalHoleId(boardId, 'E', 10),
      },
    },
    {
      id: 'C1', kind: 'capacitor', label: 'C1', rotation: 0,
      capacitanceFarads: 100e-6, ratedVoltageV: 16,
      terminalHoleIds: {
        positive: terminalHoleId(boardId, 'A', 10),
        negative: terminalHoleId(boardId, 'A', 11),
      },
    },
    {
      id: 'W2', kind: 'jumper-wire', label: 'W2', rotation: 0, color: 'black',
      terminalHoleIds: {
        a: terminalHoleId(boardId, 'E', 11),
        b: railHoleId(boardId, 'top', 'negative', 10),
      },
    },
  ];
  return {
    ...project,
    powerOn: false,
    components,
    probes: [{
      id: 'probe-capacitor',
      label: 'Capacitor voltage',
      instrumentId: 'multimeter',
      positiveHoleId: terminalHoleId(boardId, 'C', 10),
      referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
    }],
    analysis: {
      ...project.analysis,
      activeInstrument: 'oscilloscope',
      selectedProbeId: 'probe-capacitor',
    },
    simulation: { timeStepSeconds: 0.001, speed: 1 },
    oscilloscope: {
      ...project.oscilloscope,
      timePerDivisionSeconds: 0.5,
      triggerLevelV: 2.5,
      channels: {
        ch1: {
          ...project.oscilloscope.channels.ch1,
          voltsPerDivisionV: 1,
          verticalOffsetV: 2.5,
          positiveHoleId: terminalHoleId(boardId, 'C', 5),
          referenceHoleId: railHoleId(boardId, 'top', 'negative', 3),
        },
        ch2: {
          ...project.oscilloscope.channels.ch2,
          voltsPerDivisionV: 1,
          verticalOffsetV: 2.5,
          positiveHoleId: terminalHoleId(boardId, 'C', 10),
          referenceHoleId: railHoleId(boardId, 'top', 'negative', 4),
        },
      },
    },
    signalGenerator: {
      ...project.signalGenerator,
      enabled: true,
      waveform: 'square',
      frequencyHz: 0.25,
      amplitudeVpp: 5,
      offsetV: 2.5,
      outputHoleId: terminalHoleId(boardId, 'A', 5),
      referenceHoleId: railHoleId(boardId, 'top', 'negative', 5),
    },
  };
}

function ne555AstableProject(): WorkbenchProject {
  const project = createEmptyProject('NE555 Astable Oscillator');
  const boardId = project.board.id;
  const components: PlacedComponent[] = [
    {
      id: 'V1', kind: 'voltage-source', label: 'V1', rotation: 0, voltageV: 5,
      terminalHoleIds: {
        positive: railHoleId(boardId, 'top', 'positive', 2),
        negative: railHoleId(boardId, 'top', 'negative', 2),
      },
    },
    {
      id: 'GND1', kind: 'ground', label: 'GND', rotation: 0,
      terminalHoleIds: { ground: railHoleId(boardId, 'top', 'negative', 3) },
    },
    {
      id: 'U1', kind: 'ne555', label: 'U1', rotation: 0,
      deviceId: 'ne555n', packageId: 'DIP-8', simulationModel: 'hybrid-analogue-subcircuit',
      terminalHoleIds: {
        pin1: terminalHoleId(boardId, 'E', 10),
        pin2: terminalHoleId(boardId, 'E', 11),
        pin3: terminalHoleId(boardId, 'E', 12),
        pin4: terminalHoleId(boardId, 'E', 13),
        pin5: terminalHoleId(boardId, 'F', 13),
        pin6: terminalHoleId(boardId, 'F', 12),
        pin7: terminalHoleId(boardId, 'F', 11),
        pin8: terminalHoleId(boardId, 'F', 10),
      },
    },
    {
      id: 'RA', kind: 'resistor', label: 'RA', rotation: 0,
      resistanceOhms: 10_000, tolerancePercent: 5,
      terminalHoleIds: { a: terminalHoleId(boardId, 'J', 11), b: terminalHoleId(boardId, 'J', 16) },
    },
    {
      id: 'RB', kind: 'resistor', label: 'RB', rotation: 0,
      resistanceOhms: 10_000, tolerancePercent: 5,
      terminalHoleIds: { a: terminalHoleId(boardId, 'I', 11), b: terminalHoleId(boardId, 'I', 18) },
    },
    {
      id: 'C1', kind: 'capacitor', label: 'C1', rotation: 0,
      capacitanceFarads: 10e-6, ratedVoltageV: 16,
      terminalHoleIds: { positive: terminalHoleId(boardId, 'G', 18), negative: terminalHoleId(boardId, 'G', 19) },
    },
    {
      id: 'RLOAD', kind: 'resistor', label: 'RLOAD', rotation: 0,
      resistanceOhms: 1_000, tolerancePercent: 5,
      terminalHoleIds: { a: terminalHoleId(boardId, 'A', 12), b: terminalHoleId(boardId, 'A', 17) },
    },
    ...([
      ['W-GND', 'black', terminalHoleId(boardId, 'A', 10), railHoleId(boardId, 'top', 'negative', 5)],
      ['W-VCC', 'red', terminalHoleId(boardId, 'J', 10), railHoleId(boardId, 'top', 'positive', 5)],
      ['W-RESET', 'red', terminalHoleId(boardId, 'A', 13), railHoleId(boardId, 'top', 'positive', 7)],
      ['W-TRIG-THRESH', 'blue', terminalHoleId(boardId, 'A', 11), terminalHoleId(boardId, 'J', 12)],
      ['W-TIMING', 'blue', terminalHoleId(boardId, 'I', 12), terminalHoleId(boardId, 'J', 18)],
      ['W-RA-VCC', 'red', terminalHoleId(boardId, 'F', 16), railHoleId(boardId, 'top', 'positive', 9)],
      ['W-C-GND', 'black', terminalHoleId(boardId, 'H', 19), railHoleId(boardId, 'top', 'negative', 9)],
      ['W-LOAD-GND', 'black', terminalHoleId(boardId, 'E', 17), railHoleId(boardId, 'top', 'negative', 13)],
    ] as const).map(([id, color, a, b], index) => ({
      id,
      kind: 'jumper-wire' as const,
      label: `W${index + 1}`,
      rotation: 0 as const,
      color,
      terminalHoleIds: { a, b },
    })),
  ];
  return {
    ...project,
    powerOn: true,
    workspace: 'analysis',
    components,
    simulation: { timeStepSeconds: 0.001, speed: 0.5 },
    analysis: { ...project.analysis, activeInstrument: 'oscilloscope' },
    oscilloscope: {
      ...project.oscilloscope,
      timePerDivisionSeconds: 0.05,
      triggerLevelV: 2.5,
      channels: {
        ch1: {
          ...project.oscilloscope.channels.ch1,
          voltsPerDivisionV: 1,
          verticalOffsetV: 2.5,
          positiveHoleId: terminalHoleId(boardId, 'C', 12),
          referenceHoleId: railHoleId(boardId, 'top', 'negative', 14),
        },
        ch2: {
          ...project.oscilloscope.channels.ch2,
          voltsPerDivisionV: 1,
          verticalOffsetV: 2.5,
          positiveHoleId: terminalHoleId(boardId, 'H', 18),
          referenceHoleId: railHoleId(boardId, 'top', 'negative', 15),
        },
      },
    },
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
  'rc-charge-discharge': rcChargeDischargeProject,
  'ne555-astable': ne555AstableProject,
};

export function createStarterProject(id: StarterProjectId): WorkbenchProject {
  return STARTER_FACTORIES[id]();
}
