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

export type ElectricalComponent =
  | ElectricalResistor
  | ElectricalVoltageSource
  | ElectricalLed
  | ElectricalCapacitor;

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
}

export interface SimulationEngine {
  solveDC(circuit: Circuit): SimulationResult;
}

export interface TransientState {
  timeSeconds: number;
  capacitorVoltages: Record<string, number>;
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
