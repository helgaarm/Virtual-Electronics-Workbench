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
  {
    id: 'digital-thermometer',
    name: 'Digital Breadboard Thermometer',
    description: 'Measure temperature with a TMP36, convert it in ATtiny85 firmware, and multiplex a four-digit display through two 74HC595 shift registers and transistor drivers.',
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

function digitalThermometerProject(): WorkbenchProject {
  const project = createEmptyProject('Digital Breadboard Thermometer');
  project.board.columns = 50;
  const b = project.board.id;
  const dip = (start: number, count: number) => {
    const half = count / 2;
    const holes = [
      ...Array.from({ length: half }, (_, i) => terminalHoleId(b, 'E', start + i)),
      ...Array.from({ length: half }, (_, i) => terminalHoleId(b, 'F', start + half - 1 - i)),
    ];
    return Object.fromEntries(holes.map((hole, i) => [`pin${i + 1}`, hole]));
  };
  const components: PlacedComponent[] = [
    { id: 'V1', kind: 'voltage-source', label: '5V', rotation: 0, voltageV: 5, terminalHoleIds: { positive: railHoleId(b, 'top', 'positive', 1), negative: railHoleId(b, 'top', 'negative', 1) } },
    { id: 'GND1', kind: 'ground', label: 'GND', rotation: 0, terminalHoleIds: { ground: railHoleId(b, 'top', 'negative', 2) } },
    { id: 'TMP1', kind: 'tmp36', label: 'TMP36', rotation: 0, deviceId: 'tmp36', packageId: 'TO-92-inline', simulationModel: 'temperature-controlled-source', temperatureC: 23.4, terminalHoleIds: { vs: terminalHoleId(b, 'E', 2), vout: terminalHoleId(b, 'E', 3), gnd: terminalHoleId(b, 'E', 4) } },
    { id: 'MCU1', kind: 'attiny85', label: 'ATtiny85', rotation: 0, deviceId: 'attiny85', packageId: 'DIP-8', firmwareId: 'thermometer-v1', clockHz: 1_000_000, terminalHoleIds: dip(7, 8) },
    { id: 'SR1', kind: '74hc595', label: '74HC595 A', rotation: 0, deviceId: '74hc595', packageId: 'DIP-16', firmwareState: 'electrical-pins', terminalHoleIds: dip(14, 16) },
    { id: 'SR2', kind: '74hc595', label: '74HC595 B', rotation: 0, deviceId: '74hc595', packageId: 'DIP-16', firmwareState: 'electrical-pins', terminalHoleIds: dip(24, 16) },
    { id: 'DISPLAY1', kind: 'four-digit-seven-segment', label: '23.4 display', rotation: 0, packageId: '12-pin-multiplexed', commonType: 'common-cathode', terminalHoleIds: { digit1: terminalHoleId(b, 'E', 35), a: terminalHoleId(b, 'E', 36), f: terminalHoleId(b, 'E', 37), digit2: terminalHoleId(b, 'E', 38), digit3: terminalHoleId(b, 'E', 39), b: terminalHoleId(b, 'E', 40), digit4: terminalHoleId(b, 'F', 40), g: terminalHoleId(b, 'F', 39), c: terminalHoleId(b, 'F', 38), dp: terminalHoleId(b, 'F', 37), d: terminalHoleId(b, 'F', 36), e: terminalHoleId(b, 'F', 35) } },
    ...(['bc547','2n3904','bc547','2n3904'] as const).map((kind, i): PlacedComponent => {
      const row = i < 2 ? 'J' : 'I'; const column = 42 + (i % 2) * 3;
      return { id: `Q${i + 1}`, kind, label: `Q${i + 1}`, rotation: 0, deviceId: kind, packageId: 'TO-92-inline', polarity: 'npn', terminalHoleIds: kind === 'bc547' ? { collector: terminalHoleId(b, row, column), base: terminalHoleId(b, row, column + 1), emitter: terminalHoleId(b, row, column + 2) } : { emitter: terminalHoleId(b, row, column), base: terminalHoleId(b, row, column + 1), collector: terminalHoleId(b, row, column + 2) } };
    }),
    ...Array.from({ length: 8 }, (_, i): PlacedComponent => ({ id: `RSEG${i + 1}`, kind: 'resistor', label: `R${i + 1}`, rotation: 0, resistanceOhms: 330, tolerancePercent: 5, terminalHoleIds: { a: terminalHoleId(b, 'A', 35 + i), b: terminalHoleId(b, 'B', 42 + i) } })),
    ...[6, 13, 23].map((column, i): PlacedComponent => ({ id: `CDECOUPLE${i + 1}`, kind: 'capacitor', label: `C${i + 1}`, rotation: 0, capacitanceFarads: 100e-9, ratedVoltageV: 50, terminalHoleIds: { positive: terminalHoleId(b, 'A', column), negative: terminalHoleId(b, 'A', column + 1) } })),
    { id: 'RRESET', kind: 'resistor', label: 'R reset', rotation: 0, resistanceOhms: 10_000, tolerancePercent: 5, terminalHoleIds: { a: terminalHoleId(b, 'J', 7), b: terminalHoleId(b, 'J', 12) } },
  ];
  return { ...project, powerOn: true, components, probes: [{ id: 'probe-tmp36', label: 'TMP36 output', instrumentId: 'multimeter', positiveHoleId: terminalHoleId(b, 'C', 3), referenceHoleId: railHoleId(b, 'top', 'negative', 3) }], analysis: { ...project.analysis, selectedProbeId: 'probe-tmp36' }, simulation: { timeStepSeconds: 0.0001, speed: 1 }, view: { ...project.view, cameraPreset: 'top' } };
}

const STARTER_FACTORIES: Record<StarterProjectId, () => WorkbenchProject> = {
  'switched-led': createLedExampleProject,
  'voltage-divider': voltageDividerProject,
  'series-leds': seriesLedsProject,
  'parallel-indicators': parallelIndicatorsProject,
  'rc-charge-discharge': rcChargeDischargeProject,
  'ne555-astable': ne555AstableProject,
  'digital-thermometer': digitalThermometerProject,
};

export function createStarterProject(id: StarterProjectId): WorkbenchProject {
  return STARTER_FACTORIES[id]();
}
