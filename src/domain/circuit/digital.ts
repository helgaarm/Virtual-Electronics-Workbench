/** Extracted pin maps and volatile execution state; never part of a saved project. */
export interface DigitalDevice {
  id: string;
  kind: 'attiny85' | '74hc595';
  pins: Record<string, string>;
  firmwareId?: string;
  clockHz?: number;
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
  mcus: Record<string, { cpu: AvrState; nextTimeSeconds: number; powered: boolean }>;
  registers: Record<string, RegisterState>;
}
