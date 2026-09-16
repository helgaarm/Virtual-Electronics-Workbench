import type { NanoProgramId } from '../components/arduinoNano';
import type { NanoFirmware } from '../components/nanoFirmware';
import type { NanoAvrSnapshot } from './nanoAvr';
/** Extracted pin maps and volatile execution state; never part of a saved project. */
export interface DigitalDevice {
  id: string;
  kind: 'attiny85' | '74hc595' | 'arduino-nano';
  pins: Record<string, string>;
  firmwareId?: string;
  clockHz?: number;
  programId?: NanoProgramId | 'custom';
  firmware?: NanoFirmware;
}

export interface AvrState {
  programCounter: number;
  cycles: number;
  registers: Uint8Array;
  sram: Uint8Array;
  flashWords: Uint16Array;
  halted: boolean;
  carry?: boolean;
  zero?: boolean;
}

export interface RegisterState {
  shiftBits: readonly boolean[];
  outputBits: readonly boolean[];
  previousShiftClock: 'low' | 'high' | 'indeterminate';
  previousLatchClock: 'low' | 'high' | 'indeterminate';
}

export interface DigitalState {
  nanos: Record<string, { programId: NanoProgramId | 'custom'; powered: boolean; outputHigh: boolean; nextTimeSeconds: number; startedAtSeconds: number;
    firmwareHex?: string; avr?: NanoAvrSnapshot; eeprom?: Uint8Array }>;
  mcus: Record<string, { cpu: AvrState; nextTimeSeconds: number; powered: boolean }>;
  registers: Record<string, RegisterState>;
}
