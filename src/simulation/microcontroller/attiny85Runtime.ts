export interface Attiny85PinBridge {
  readPinVoltageV(pin: number): number;
  drivePin(pin: number, level: 'low' | 'high' | 'high-impedance'): void;
  supplyVoltageV(): number;
}

export interface Attiny85RuntimeState {
  programCounter: number;
  cycles: number;
  registers: Uint8Array;
  sram: Uint8Array;
  flashWords: Uint16Array;
  halted: boolean;
}

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
 * needed by bundled validation firmware (NOP, LDI, OUT, RJMP). Unsupported opcodes
 * halt rather than being mistaken for application behaviour.
 */
export function stepAttiny85(state: Attiny85RuntimeState, bridge: Attiny85PinBridge): Attiny85RuntimeState {
  if (state.halted) return state;
  const registers = state.registers.slice();
  const opcode = state.flashWords[state.programCounter] ?? 0xffff;
  let programCounter = state.programCounter + 1;
  let cycles = 1;
  let halted = false;
  if (opcode === 0x0000) {
    // NOP
  } else if ((opcode & 0xf000) === 0xe000) {
    const register = 16 + ((opcode >> 4) & 0x0f);
    registers[register] = ((opcode >> 4) & 0xf0) | (opcode & 0x0f);
  } else if ((opcode & 0xf800) === 0xb800) {
    const ioAddress = ((opcode >> 5) & 0x30) | (opcode & 0x0f);
    const register = (opcode >> 4) & 0x1f;
    if (ioAddress === 0x18) {
      for (let pin = 0; pin < 6; pin += 1) bridge.drivePin(pin, registers[register] & (1 << pin) ? 'high' : 'low');
    }
  } else if ((opcode & 0xf000) === 0xc000) {
    const encoded = opcode & 0x0fff;
    const offset = encoded & 0x0800 ? encoded - 0x1000 : encoded;
    programCounter += offset;
    cycles = 2;
  } else {
    halted = true;
  }
  return { ...state, registers, programCounter, cycles: state.cycles + cycles, halted };
}

export function runAttiny85Cycles(state: Attiny85RuntimeState, bridge: Attiny85PinBridge, cycleBudget: number): Attiny85RuntimeState {
  let next = state;
  const target = state.cycles + Math.max(0, Math.floor(cycleBudget));
  while (!next.halted && next.cycles < target) next = stepAttiny85(next, bridge);
  return next;
}
