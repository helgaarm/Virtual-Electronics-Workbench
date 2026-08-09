export interface ElectricalNode {
  id: string;
}

export interface ElectricalResistor {
  id: string;
  kind: 'resistor';
  positiveNodeId: string;
  negativeNodeId: string;
  resistanceOhms: number;
}

export interface ElectricalVoltageSource {
  id: string;
  kind: 'voltage-source';
  positiveNodeId: string;
  negativeNodeId: string;
  voltageV: number;
}

export interface ElectricalSignalSource {
  id: string;
  kind: 'signal-source';
  positiveNodeId: string;
  negativeNodeId: string;
  waveform: 'square' | 'sine';
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
}

export interface ElectricalLed {
  id: string;
  kind: 'led';
  positiveNodeId: string;
  negativeNodeId: string;
  forwardVoltageV: number;
  onResistanceOhms: number;
}

export interface ElectricalCapacitor {
  id: string;
  kind: 'capacitor';
  positiveNodeId: string;
  negativeNodeId: string;
  capacitanceFarads: number;
}

/** Parameters shared by Shockley junctions. Temperature is explicit so device
 * behaviour stays deterministic instead of depending on ambient state. */
export interface SemiconductorJunctionModel {
  saturationCurrentA: number;
  emissionCoefficient: number;
  temperatureK: number;
}

export interface ElectricalDiode {
  id: string;
  kind: 'diode';
  positiveNodeId: string;
  negativeNodeId: string;
  model: SemiconductorJunctionModel;
}

export interface ElectricalBjt {
  id: string;
  kind: 'bjt';
  polarity: 'npn' | 'pnp';
  collectorNodeId: string;
  baseNodeId: string;
  emitterNodeId: string;
  model: SemiconductorJunctionModel & {
    forwardBeta: number;
    reverseBeta: number;
  };
}

/** Smooth, unipolar voltage-controlled current sink used to compose reusable
 * analogue comparators without discontinuous threshold logic. */
export interface ElectricalSmoothTransconductance {
  id: string;
  kind: 'smooth-transconductance';
  outputPositiveNodeId: string;
  outputNegativeNodeId: string;
  controlPositiveNodeId: string;
  controlNegativeNodeId: string;
  maximumCurrentA: number;
  transitionVoltageV: number;
}

export interface ElectricalSmoothSwitch {
  id: string;
  kind: 'smooth-switch';
  positiveNodeId: string;
  negativeNodeId: string;
  controlPositiveNodeId: string;
  controlNegativeNodeId: string;
  onResistanceOhms: number;
  transitionVoltageV: number;
}

export interface ElectricalSubcircuitDefinition {
  externalNodeIds: string[];
  internalNodeIds: string[];
  components: ElectricalComponent[];
  /** Retains a previous nonlinear operating branch even without reactive parts. */
  stateful?: boolean;
}

export interface ElectricalSubcircuit {
  id: string;
  kind: 'subcircuit';
  externalNodes: Record<string, string>;
  definition: ElectricalSubcircuitDefinition;
}

export type ElectricalComponent =
  | ElectricalResistor
  | ElectricalVoltageSource
  | ElectricalSignalSource
  | ElectricalLed
  | ElectricalCapacitor
  | ElectricalDiode
  | ElectricalBjt
  | ElectricalSmoothTransconductance
  | ElectricalSmoothSwitch
  | ElectricalSubcircuit;

export interface Circuit {
  nodes: ElectricalNode[];
  groundNodeId: string;
  components: ElectricalComponent[];
}

export interface SimulationMessage {
  code: string;
  message: string;
  componentId?: string;
}

export interface SimulationResult {
  status: 'ok' | 'warning' | 'error';
  nodeVoltages: Record<string, number>;
  componentCurrents: Record<string, number>;
  componentPowers: Record<string, number>;
  warnings: SimulationMessage[];
  errors: SimulationMessage[];
  iterations: number;
  diagnostics?: {
    nonlinearIterations: number;
    maximumVoltageDeltaV: number;
    maximumCurrentResidualA: number;
  };
}

export interface SimulationEngine {
  solveDC(circuit: Circuit): SimulationResult;
}

export interface TransientState {
  timeSeconds: number;
  capacitorVoltages: Record<string, number>;
  /** Last converged solution, used only as a Newton initial estimate. */
  nodeVoltages?: Record<string, number>;
}

export interface TransientFrame {
  state: TransientState;
  result: SimulationResult;
}

export interface TransientSample {
  timeSeconds: number;
  nodeVoltages: Record<string, number>;
  componentCurrents: Record<string, number>;
}

export interface TransientSimulationEngine {
  createState(circuit: Circuit, previous?: TransientState): TransientState;
  step(circuit: Circuit, state: TransientState, timeStepSeconds: number): TransientFrame;
}

export function signalSourceVoltageAtTime(
  source: Pick<ElectricalSignalSource, 'waveform' | 'frequencyHz' | 'amplitudeVpp' | 'offsetV'>,
  timeSeconds: number,
): number {
  const amplitudeV = source.amplitudeVpp / 2;
  if (source.waveform === 'sine') {
    return source.offsetV + amplitudeV * Math.sin(2 * Math.PI * source.frequencyHz * timeSeconds);
  }
  const cycle = ((timeSeconds * source.frequencyHz) % 1 + 1) % 1;
  return source.offsetV + (cycle < 0.5 ? amplitudeV : -amplitudeV);
}

export function electricalComponentNodeIds(component: ElectricalComponent): string[] {
  if (component.kind === 'bjt') {
    return [component.collectorNodeId, component.baseNodeId, component.emitterNodeId];
  }
  if (component.kind === 'subcircuit') return Object.values(component.externalNodes);
  if (component.kind === 'smooth-transconductance') {
    return [
      component.outputPositiveNodeId,
      component.outputNegativeNodeId,
      component.controlPositiveNodeId,
      component.controlNegativeNodeId,
    ];
  }
  if (component.kind === 'smooth-switch') {
    return [
      component.positiveNodeId,
      component.negativeNodeId,
      component.controlPositiveNodeId,
      component.controlNegativeNodeId,
    ];
  }
  return [component.positiveNodeId, component.negativeNodeId];
}
