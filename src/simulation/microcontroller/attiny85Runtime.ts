export interface Attiny85PinBridge {
  readPinVoltageV(pin: number): number;
  drivePin(pin: number, level: 'low' | 'high' | 'high-impedance'): void;
  supplyVoltageV(): number;
}

export type { AvrState as Attiny85RuntimeState } from '../../domain/circuit/digital';
import type { AvrState as Attiny85RuntimeState } from '../../domain/circuit/digital';

export function parseIntelHex(source: string, flashBytes = 8192): Uint8Array {
  const output = new Uint8Array(flashBytes).fill(0xff);
  let upperAddress = 0;
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!/^:[0-9A-F]+$/iu.test(line)) throw new Error('Invalid Intel HEX record.');
    const bytes = Array.from({ length: (line.length - 1) / 2 }, (_, index) => Number.parseInt(line.slice(1 + index * 2, 3 + index * 2), 16));
    const count = bytes[0];
    const address = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    if (bytes.length !== count + 5 || bytes.reduce((sum, byte) => sum + byte, 0) % 256 !== 0) throw new Error('Invalid Intel HEX checksum.');
    if (type === 0) output.set(bytes.slice(4, 4 + count), upperAddress + address);
    else if (type === 1) break;
    else if (type === 4) upperAddress = ((bytes[4] << 8) | bytes[5]) << 16;
  }
  return output;
}

export function createAttiny85Runtime(intelHex: string): Attiny85RuntimeState {
  const bytes = parseIntelHex(intelHex);
  const flashWords = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < flashWords.length; index += 1) flashWords[index] = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
  return { programCounter: 0, cycles: 0, registers: new Uint8Array(32), sram: new Uint8Array(512), flashWords, halted: false };
}

export function quantizeAdc(inputVoltageV: number, referenceVoltageV: number): number {
  if (!(referenceVoltageV > 0)) return 0;
  return Math.round(Math.min(1, Math.max(0, inputVoltageV / referenceVoltageV)) * 1023);
}

/**
 * Small deterministic AVR core used by the adapter. It executes genuine AVR opcodes
 * used by the bundled firmware: immediate/register arithmetic, IN/OUT, LPM,
 * bit skips, and conditional/relative branches. Unsupported opcodes halt.
 */
export function stepAttiny85(state: Attiny85RuntimeState, bridge: Attiny85PinBridge, inPlace = false): Attiny85RuntimeState {
  if (state.halted) return state;
  const registers = inPlace ? state.registers : state.registers.slice();
  const sram = inPlace ? state.sram : state.sram.slice();
  const opcode = state.flashWords[state.programCounter] ?? 0xffff;
  let programCounter = state.programCounter + 1;
  let cycles = 1;
  let halted = false;
  let carry = state.carry ?? false;
  let zero = state.zero ?? false;
  const rd = (opcode >> 4) & 31;
  const rr = (opcode & 15) | ((opcode >> 5) & 16);
  const immediate = ((opcode >> 4) & 0xf0) | (opcode & 15);
  const highRegister = 16 + ((opcode >> 4) & 15);
  const writeIo = (address: number, value: number) => {
    sram[address] = value;
    if (address === 6 && (value & 0xc0) === 0xc0) {
      // Single-ended, VCC-referenced ADC. Conversion timing is educational/instantaneous.
      const channelPins = [5, 2, 4, 3];
      const mux = sram[7];
      if ((mux & 0xf0) !== 0 || (mux & 15) > 3) { halted = true; return; }
      const adc = quantizeAdc(bridge.readPinVoltageV(channelPins[mux & 15]), bridge.supplyVoltageV());
      sram[4] = adc & 255;
      sram[5] = adc >> 8;
      sram[6] = (value & ~0x40) | 0x10;
    }
    if (address === 0x18 || address === 0x17) {
      for (let pin = 0; pin < 6; pin += 1) bridge.drivePin(pin,
        sram[0x17] & (1 << pin) ? (sram[0x18] & (1 << pin) ? 'high' : 'low') : 'high-impedance');
    }
  };
  if (opcode === 0x0000) {
    // NOP
  } else if ((opcode & 0xf000) === 0xe000) {
    const register = 16 + ((opcode >> 4) & 0x0f);
    registers[register] = ((opcode >> 4) & 0xf0) | (opcode & 0x0f);
  } else if ((opcode & 0xf800) === 0xb800) {
    const ioAddress = ((opcode >> 5) & 0x30) | (opcode & 0x0f);
    const register = (opcode >> 4) & 0x1f;
    writeIo(ioAddress, registers[register]);
  } else if ((opcode & 0xf800) === 0xb000) {
    registers[rd] = sram[((opcode >> 5) & 0x30) | (opcode & 15)];
  } else if ((opcode & 0xfc00) === 0x2c00) {
    registers[rd] = registers[rr];
  } else if ((opcode & 0xfc00) === 0x0c00 || (opcode & 0xfc00) === 0x1c00) {
    const value = registers[rd] + registers[rr] + ((opcode & 0xfc00) === 0x1c00 && carry ? 1 : 0);
    carry = value > 255;
    registers[rd] = value & 255;
    zero = registers[rd] === 0;
  } else if ((opcode & 0xf000) === 0x7000 || (opcode & 0xf000) === 0x6000) {
    registers[highRegister] = (opcode & 0xf000) === 0x7000
      ? registers[highRegister] & immediate : registers[highRegister] | immediate;
    zero = registers[highRegister] === 0;
  } else if ((opcode & 0xfe0f) === 0x940a) {
    registers[rd] = (registers[rd] - 1) & 255;
    zero = registers[rd] === 0;
  } else if ((opcode & 0xfc07) === 0xf401) {
    if (!zero) {
      const offset = (opcode >> 3) & 127;
      programCounter += offset >= 64 ? offset - 128 : offset;
      cycles = 2;
    }
  } else if ((opcode & 0xfe08) === 0xfc00) {
    if (!(registers[rd] & (1 << (opcode & 7)))) { programCounter += 1; cycles = 2; }
  } else if ((opcode & 0xfe0f) === 0x9005) {
    const address = registers[30] | (registers[31] << 8);
    registers[rd] = ((state.flashWords[address >> 1] ?? 0xffff) >> ((address & 1) * 8)) & 255;
    registers[30] = (address + 1) & 255;
    registers[31] = ((address + 1) >> 8) & 255;
    cycles = 3;
  } else if ((opcode & 0xf000) === 0xc000) {
    const encoded = opcode & 0x0fff;
    const offset = encoded & 0x0800 ? encoded - 0x1000 : encoded;
    programCounter += offset;
    cycles = 2;
  } else {
    halted = true;
  }
  const next = { ...state, sram, registers, programCounter, cycles: state.cycles + cycles, halted, carry, zero };
  return inPlace ? Object.assign(state, next) : next;
}

export function runAttiny85Cycles(state: Attiny85RuntimeState, bridge: Attiny85PinBridge, cycleBudget: number): Attiny85RuntimeState {
  let next = state;
  const target = state.cycles + Math.max(0, Math.floor(cycleBudget));
  while (!next.halted && next.cycles < target) next = stepAttiny85(next, bridge);
  return next;
}
