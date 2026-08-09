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

export interface Tmp36Component extends ComponentBase {
  kind: 'tmp36';
  deviceId: 'tmp36';
  packageId: 'TO-92-inline';
  simulationModel: 'temperature-controlled-source';
  temperatureC: number;
  terminalHoleIds: { vs: string; vout: string; gnd: string };
}

export type TransistorDeviceId = 'bc547' | 'bc557' | '2n3904' | '2n3906';
export interface SmallSignalDiodeComponent extends ComponentBase {
  kind: 'diode-1n4148'; deviceId: '1n4148'; packageId: 'DO-35';
  terminalHoleIds: { anode: string; cathode: string };
}
export interface TransistorComponent extends ComponentBase {
  kind: TransistorDeviceId; deviceId: TransistorDeviceId; packageId: 'TO-92-inline';
  polarity: 'npn' | 'pnp';
  terminalHoleIds: { collector: string; base: string; emitter: string };
}
export interface PotentiometerComponent extends ComponentBase {
  kind: 'potentiometer'; totalResistanceOhms: number; wiperPosition: number;
  terminalHoleIds: { a: string; wiper: string; b: string };
}
export interface SevenSegmentComponent extends ComponentBase {
  kind: 'seven-segment'; packageId: 'DIP-10'; commonType: 'common-cathode';
  terminalHoleIds: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'dp' | 'common1' | 'common2', string>;
}
export interface FourDigitSevenSegmentComponent extends ComponentBase {
  kind: 'four-digit-seven-segment'; packageId: '12-pin-multiplexed'; commonType: 'common-cathode';
  terminalHoleIds: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'dp' | 'digit1' | 'digit2' | 'digit3' | 'digit4', string>;
}
export interface ShiftRegisterComponent extends ComponentBase {
  kind: '74hc595'; deviceId: '74hc595'; packageId: 'DIP-16'; firmwareState: 'electrical-pins';
  terminalHoleIds: Record<`pin${number}`, string>;
}
export interface Attiny85Component extends ComponentBase {
  kind: 'attiny85'; deviceId: 'attiny85'; packageId: 'DIP-8'; firmwareId: string;
  clockHz: number; terminalHoleIds: Record<`pin${number}`, string>;
}

export type PlacedComponent =
  | VoltageSourceComponent
  | GroundComponent
  | ResistorComponent
  | LedComponent
  | CapacitorComponent
  | SwitchComponent
  | JumperWireComponent
  | Ne555Component
  | Tmp36Component
  | SmallSignalDiodeComponent | TransistorComponent | PotentiometerComponent
  | SevenSegmentComponent | FourDigitSevenSegmentComponent | ShiftRegisterComponent | Attiny85Component;

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
    case 'tmp36':
      return 'TMP36 temperature sensor';
    case 'diode-1n4148': return '1N4148 diode';
    case 'bc547': return 'BC547 NPN transistor';
    case 'bc557': return 'BC557 PNP transistor';
    case '2n3904': return '2N3904 NPN transistor';
    case '2n3906': return '2N3906 PNP transistor';
    case 'potentiometer': return '10 kΩ trimmer';
    case 'seven-segment': return '1-digit 7-segment display';
    case 'four-digit-seven-segment': return '4-digit 7-segment display';
    case '74hc595': return '74HC595 shift register';
    case 'attiny85': return 'ATtiny85 microcontroller';
  }
}
