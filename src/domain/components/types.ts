import type { QuarterTurn } from '../physical/geometry';

export const LED_COLORS = ['red', 'green', 'yellow', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];
export const WIRE_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'orange'] as const;
export type WireColor = (typeof WIRE_COLORS)[number];
export const LED_TYPICAL_FORWARD_VOLTAGE_V: Record<LedColor, number> = {
  red: 1.9,
  green: 2.1,
  yellow: 2,
  blue: 3,
  white: 3,
};

interface ComponentBase {
  id: string;
  label: string;
  rotation: QuarterTurn;
  anchored?: boolean;
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
  color: LedColor;
  forwardVoltageV: number;
  onResistanceOhms: number;
  terminalHoleIds: { anode: string; cathode: string };
}

export interface CapacitorComponent extends ComponentBase {
  kind: 'capacitor';
  capacitanceFarads: number;
  ratedVoltageV: number;
  terminalHoleIds: { positive: string; negative: string };
}

export interface SwitchComponent extends ComponentBase {
  kind: 'switch';
  closed: boolean;
  terminalHoleIds: { a: string; b: string };
}

export interface JumperWireComponent extends ComponentBase {
  kind: 'jumper-wire';
  color: WireColor;
  terminalHoleIds: { a: string; b: string };
}

export const NE555_PIN_NAMES = {
  pin1: 'GND',
  pin2: 'TRIGGER',
  pin3: 'OUTPUT',
  pin4: 'RESET',
  pin5: 'CONTROL VOLTAGE',
  pin6: 'THRESHOLD',
  pin7: 'DISCHARGE',
  pin8: 'VCC',
} as const;

export type Ne555PinId = keyof typeof NE555_PIN_NAMES;

export interface Ne555Component extends ComponentBase {
  kind: 'ne555';
  deviceId: 'ne555n';
  packageId: 'DIP-8';
  simulationModel: 'hybrid-analogue-subcircuit';
  terminalHoleIds: Record<Ne555PinId, string>;
}

export type PlacedComponent =
  | VoltageSourceComponent
  | GroundComponent
  | ResistorComponent
  | LedComponent
  | CapacitorComponent
  | SwitchComponent
  | JumperWireComponent
  | Ne555Component;

export type ComponentKind = PlacedComponent['kind'];

export function isComponentAnchored(component: PlacedComponent): boolean {
  return component.anchored !== false;
}

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
    case 'capacitor':
      return 'Capacitor';
    case 'switch':
      return 'Switch';
    case 'jumper-wire':
      return 'Jumper wire';
    case 'ne555':
      return 'NE555N timer';
  }
}
