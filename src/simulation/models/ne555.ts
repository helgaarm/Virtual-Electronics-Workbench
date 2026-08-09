import type {
  ElectricalComponent,
  ElectricalSubcircuit,
  ElectricalSubcircuitDefinition,
} from '../../domain/circuit/types';

function resistor(
  id: string,
  positiveNodeId: string,
  negativeNodeId: string,
  resistanceOhms: number,
): ElectricalComponent {
  return { id, kind: 'resistor', positiveNodeId, negativeNodeId, resistanceOhms };
}

function diode(id: string, positiveNodeId: string, negativeNodeId: string): ElectricalComponent {
  return {
    id,
    kind: 'diode',
    positiveNodeId,
    negativeNodeId,
    model: {
      saturationCurrentA: 1e-14,
      emissionCoefficient: 1,
      temperatureK: 298.15,
    },
  };
}

function smoothSink(
  id: string,
  outputNodeId: string,
  controlPositiveNodeId: string,
  controlNegativeNodeId: string,
  maximumCurrentA: number,
  transitionVoltageV = 0.04,
): ElectricalComponent {
  return {
    id,
    kind: 'smooth-transconductance',
    outputPositiveNodeId: outputNodeId,
    outputNegativeNodeId: 'gnd',
    controlPositiveNodeId,
    controlNegativeNodeId,
    maximumCurrentA,
    transitionVoltageV,
  };
}

function smoothSwitch(
  id: string,
  positiveNodeId: string,
  negativeNodeId: string,
  controlPositiveNodeId: string,
  controlNegativeNodeId: string,
  onResistanceOhms: number,
  transitionVoltageV = 0.06,
): ElectricalComponent {
  return {
    id,
    kind: 'smooth-switch',
    positiveNodeId,
    negativeNodeId,
    controlPositiveNodeId,
    controlNegativeNodeId,
    onResistanceOhms,
    transitionVoltageV,
  };
}

/**
 * Hybrid analogue 555 subcircuit. The 1/3 and 2/3 references emerge from the
 * three 5 kΩ divider resistors. Reusable smooth transconductance stages model
 * comparator current steering; a cross-coupled analogue latch provides memory;
 * finite-resistance switches model the bipolar output and discharge stages.
 * No output waveform or oscillator equation exists in this model.
 */
export const NE555_HYBRID_SUBCIRCUIT: ElectricalSubcircuitDefinition = {
  stateful: true,
  externalNodeIds: [
    'gnd', 'trigger', 'output', 'reset', 'control', 'threshold', 'discharge', 'vcc',
  ],
  internalNodeIds: [
    'lower-ref', 'reset-ref', 'trigger-assert', 'threshold-assert', 'reset-assert',
    'latch-q', 'latch-qb',
  ],
  components: [
    // Factual bipolar-555 divider values. CONTROL is the upper tap.
    resistor('R-DIV-TOP', 'vcc', 'control', 5_000),
    resistor('R-DIV-MIDDLE', 'control', 'lower-ref', 5_000),
    resistor('R-DIV-BOTTOM', 'lower-ref', 'gnd', 5_000),

    // A biased junction keeps RESET release near 0.8 V across the supply range.
    resistor('R-RESET-REF-BIAS', 'vcc', 'reset-ref', 47_000),
    diode('D-RESET-REF', 'reset-ref', 'gnd'),

    // Comparator outputs are high when their respective condition is asserted.
    resistor('R-TRIGGER-ASSERT', 'vcc', 'trigger-assert', 100_000),
    smoothSink('A-TRIGGER-COMPARATOR', 'trigger-assert', 'trigger', 'lower-ref', 0.45e-3),
    resistor('R-THRESHOLD-ASSERT', 'vcc', 'threshold-assert', 100_000),
    smoothSink('A-THRESHOLD-COMPARATOR', 'threshold-assert', 'control', 'threshold', 0.45e-3),
    resistor('R-RESET-ASSERT', 'vcc', 'reset-assert', 100_000),
    smoothSink('A-RESET-COMPARATOR', 'reset-assert', 'reset', 'reset-ref', 0.45e-3),

    // Cross-coupled saturating analogue stages retain state between thresholds.
    resistor('R-LATCH-Q-PULLUP', 'vcc', 'latch-q', 5_000),
    resistor('R-LATCH-QB-PULLUP', 'vcc', 'latch-qb', 5_000),
    // Plausible lumped on-die parasitic charge keeps the selected analogue
    // branch continuous across an external rewiring/topology preview.
    {
      id: 'C-LATCH-Q', kind: 'capacitor', positiveNodeId: 'latch-q', negativeNodeId: 'gnd',
      capacitanceFarads: 10e-12,
    },
    {
      id: 'C-LATCH-QB', kind: 'capacitor', positiveNodeId: 'latch-qb', negativeNodeId: 'gnd',
      capacitanceFarads: 10e-12,
    },
    smoothSink('A-LATCH-Q-CROSS', 'latch-q', 'latch-qb', 'lower-ref', 10e-3, 0.08),
    smoothSink('A-LATCH-QB-CROSS', 'latch-qb', 'latch-q', 'lower-ref', 10e-3, 0.08),

    // Trigger has priority over threshold; electrical RESET has highest priority.
    smoothSink('A-SET-SINK-QB', 'latch-qb', 'trigger-assert', 'lower-ref', 50e-3),
    smoothSwitch('S-SET-PULLUP-Q', 'vcc', 'latch-q', 'trigger-assert', 'lower-ref', 20),
    smoothSink('A-THRESHOLD-RESET-SINK-Q', 'latch-q', 'threshold-assert', 'lower-ref', 15e-3),
    smoothSwitch('S-THRESHOLD-RESET-PULLUP-QB', 'vcc', 'latch-qb', 'threshold-assert', 'lower-ref', 120),
    smoothSink('A-RESET-SINK-Q', 'latch-q', 'reset-assert', 'lower-ref', 100e-3),
    smoothSwitch('S-RESET-PULLUP-QB', 'vcc', 'latch-qb', 'reset-assert', 'lower-ref', 5),

    // Finite output/discharge resistance avoids hidden ideal voltage sources.
    smoothSwitch('S-OUTPUT-HIGH', 'vcc', 'output', 'latch-q', 'latch-qb', 50),
    smoothSwitch('S-OUTPUT-LOW', 'output', 'gnd', 'latch-qb', 'latch-q', 20),
    smoothSwitch('S-DISCHARGE', 'discharge', 'gnd', 'latch-qb', 'latch-q', 30),
  ],
};

export function createNe555Subcircuit(
  id: string,
  externalNodes: ElectricalSubcircuit['externalNodes'],
): ElectricalSubcircuit {
  return {
    id,
    kind: 'subcircuit',
    externalNodes,
    definition: NE555_HYBRID_SUBCIRCUIT,
  };
}
