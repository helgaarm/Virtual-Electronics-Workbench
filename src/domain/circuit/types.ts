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

export type ElectricalComponent = ElectricalResistor | ElectricalVoltageSource | ElectricalLed;

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
