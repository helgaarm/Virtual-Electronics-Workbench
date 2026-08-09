import { finiteDigitalOutput, logicLevelFromVoltage, type DigitalOutputDrive, type LogicLevel } from '../mixedSignal';

export interface ShiftRegisterInputs {
  data: LogicLevel;
  shiftClock: LogicLevel;
  latchClock: LogicLevel;
  clear: LogicLevel;
  outputEnable: LogicLevel;
}

export interface ShiftRegisterState {
  shiftBits: readonly boolean[];
  outputBits: readonly boolean[];
  previousShiftClock: LogicLevel;
  previousLatchClock: LogicLevel;
}

export function create74hc595State(): ShiftRegisterState {
  return {
    shiftBits: Array<boolean>(8).fill(false),
    outputBits: Array<boolean>(8).fill(false),
    previousShiftClock: 'low',
    previousLatchClock: 'low',
  };
}

export function step74hc595(state: ShiftRegisterState, inputs: ShiftRegisterInputs): ShiftRegisterState {
  let shiftBits = [...state.shiftBits];
  let outputBits = [...state.outputBits];
  if (inputs.clear === 'low') shiftBits.fill(false);
  else if (state.previousShiftClock !== 'high' && inputs.shiftClock === 'high') {
    shiftBits = [inputs.data === 'high', ...shiftBits.slice(0, 7)];
  }
  if (state.previousLatchClock !== 'high' && inputs.latchClock === 'high') outputBits = [...shiftBits];
  return { shiftBits, outputBits, previousShiftClock: inputs.shiftClock, previousLatchClock: inputs.latchClock };
}

export function serialOutput(state: ShiftRegisterState): boolean {
  return state.shiftBits[7] ?? false;
}

export function parallelOutputDrives(
  state: ShiftRegisterState,
  outputEnable: LogicLevel,
  groundVoltageV: number,
  supplyVoltageV: number,
): DigitalOutputDrive[] {
  return state.outputBits.map((bit) => finiteDigitalOutput(
    outputEnable === 'low' ? (bit ? 'high' : 'low') : 'high-impedance',
    groundVoltageV,
    supplyVoltageV,
  ));
}

export function hc595InputLevel(inputVoltageV: number, groundVoltageV: number, supplyVoltageV: number): LogicLevel {
  return logicLevelFromVoltage(inputVoltageV, groundVoltageV, supplyVoltageV);
}
