import type { QuarterTurn } from '../physical/geometry';

interface ComponentBase {
  id: string;
  label: string;
  rotation: QuarterTurn;
}

export interface VoltageSourceComponent extends ComponentBase {
  kind: 'voltage-source';
  voltageV: number;
  terminalHoleIds: { positive: string; negative: string };
}

export interface GroundComponent extends ComponentBase {
  kind: 'ground';
  terminalHoleIds: { ground: string };
}

export interface ResistorComponent extends ComponentBase {
  kind: 'resistor';
  resistanceOhms: number;
  tolerancePercent: number;
  terminalHoleIds: { a: string; b: string };
}

export interface LedComponent extends ComponentBase {
  kind: 'led';
  color: 'red' | 'green' | 'yellow' | 'blue' | 'white';
  forwardVoltageV: number;
  onResistanceOhms: number;
  terminalHoleIds: { anode: string; cathode: string };
}

export interface SwitchComponent extends ComponentBase {
  kind: 'switch';
  closed: boolean;
  terminalHoleIds: { a: string; b: string };
}

export interface JumperWireComponent extends ComponentBase {
  kind: 'jumper-wire';
  color: 'red' | 'black' | 'blue' | 'green' | 'yellow' | 'orange';
  terminalHoleIds: { a: string; b: string };
}

export type PlacedComponent =
  | VoltageSourceComponent
  | GroundComponent
  | ResistorComponent
  | LedComponent
  | SwitchComponent
  | JumperWireComponent;

export type ComponentKind = PlacedComponent['kind'];

export function terminalEntries(component: PlacedComponent): Array<[string, string]> {
  return Object.entries(component.terminalHoleIds);
}

export function componentDisplayName(kind: ComponentKind): string {
  switch (kind) {
    case 'voltage-source':
      return '5 V power';
    case 'ground':
      return 'Ground';
    case 'resistor':
      return 'Resistor';
    case 'led':
      return 'LED';
    case 'switch':
      return 'Switch';
    case 'jumper-wire':
      return 'Jumper wire';
  }
}
