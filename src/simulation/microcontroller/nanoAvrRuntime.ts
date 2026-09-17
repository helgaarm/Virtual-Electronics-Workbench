import { ADCMuxInputType, AVRADC, AVREEPROM, AVRIOPort, AVRTimer, AVRTWI, AVRUSART, CPU, EEPROMMemoryBackend, PinState, adcConfig, avrInstruction, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, twiConfig, usart0Config } from 'avr8js';
import type { NanoAvrSnapshot } from '../../domain/circuit/nanoAvr';
import { parseNanoHex } from '../../domain/components/nanoFirmware';

export const NANO_CLOCK_HZ = 16_000_000;
export const MAX_SERIAL_CHARACTERS = 4_096;
/** Physical Nano header pin, AVR port (B/C/D), bit. A6/A7 are analogue-only. */
export const NANO_GPIO = [
  [11, 0, 0], [12, 0, 1], [13, 0, 2], [14, 0, 3], [15, 0, 4], [16, 0, 5],
  [19, 1, 0], [20, 1, 1], [21, 1, 2], [22, 1, 3], [23, 1, 4], [24, 1, 5],
  [2, 2, 0], [1, 2, 1], [5, 2, 2], [6, 2, 3], [7, 2, 4], [8, 2, 5], [9, 2, 6], [10, 2, 7],
] as const;
export { PinState };

type ClockEvent = { cycles: number; callback: () => void; next: ClockEvent | null };
type CpuSnapshotAccess = { pendingInterrupts: NanoAvrSnapshot['pendingInterrupts']; nextClockEvent: ClockEvent | null };
type TimerSnapshotAccess = { count: () => void; externalClockCallback: (value: boolean) => void; externalClockPort?: AVRIOPort };
type Interrupt = NanoAvrSnapshot['pendingInterrupts'][number] & object;

const flashCache = new Map<string, Uint16Array>();
function flashWords(hex: string): Uint16Array {
  const cached = flashCache.get(hex);
  if (cached) return cached;
  const parsed = parseNanoHex(hex);
  if (!parsed.ok) throw new Error(parsed.error);
  const words = new Uint16Array(parsed.bytes.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = parsed.bytes[i * 2] | (parsed.bytes[i * 2 + 1] << 8);
  if (flashCache.size >= 4) flashCache.delete(flashCache.keys().next().value!);
  flashCache.set(hex, words);
  return words;
}

function primitiveState(object: object): Record<string, number | boolean | string> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => ['number', 'boolean', 'string'].includes(typeof value)));
}

/**
 * AVR8js 0.21.1 snapshot adapter. The dependency is pinned because its private timer/CPU
 * state is part of this boundary. Clock callbacks are rebuilt by identity, never serialized.
 * Regression tests compare uninterrupted execution with structured-cloned continuations.
 */
export class NanoAvrRuntime {
  onTwiAddress: (address: number, write: boolean) => boolean = () => false;
  onTwiByte: (address: number, value: number) => boolean = () => false;
  private twiAddress = -1;
  private pendingTwi?: NanoAvrSnapshot['pendingTwi'];
  outputsChanged = false;
  readonly cpu: CPU;
  readonly ports: AVRIOPort[];
  private readonly peripherals: object[];
  private readonly callbacks = new Map<string, () => void>();
  private readonly adc: AVRADC;
  private readonly eeprom: EEPROMMemoryBackend;
  private adcResult = 0;
  private nextInputCycle = 0;
  private serialOutput = '';
  private clockContext = '';
  private readPin: (pin: number) => number = () => 0;
  private settleInputs: () => void = () => {};

  constructor(hex: string, previous?: NanoAvrSnapshot, retainedEeprom?: Uint8Array) {
    this.cpu = new CPU(flashWords(hex), 2_048);
    const cpu = this.cpu;
    this.ports = [portBConfig, portCConfig, portDConfig].map((config) => new AVRIOPort(cpu, config));
    this.ports.forEach((port) => port.addListener(() => { this.outputsChanged = true; }));
    const timerConfigs = [timer0Config, timer1Config, timer2Config];
    const timers = timerConfigs.map((config) => new AVRTimer(cpu, config));
    timers.forEach((timer, i) => this.callbacks.set(`timer-${i}`, (timer as unknown as TimerSnapshotAccess).count));
    this.adc = new AVRADC(cpu, adcConfig);
    const usart = new AVRUSART(cpu, usart0Config, NANO_CLOCK_HZ);
    this.eeprom = new EEPROMMemoryBackend(1_024);
    if (retainedEeprom) this.eeprom.memory.set(retainedEeprom);
    const eeprom = new AVREEPROM(cpu, this.eeprom);
    const twi = new AVRTWI(cpu, twiConfig, NANO_CLOCK_HZ);
    this.peripherals = [...this.ports, ...timers, this.adc, usart, eeprom, twi];
    this.callbacks.set('twi', () => {
      const request = this.pendingTwi;
      this.pendingTwi = undefined;
      if (!request) return;
      this.settleInputs();
      if (request.control & 0x20) { this.twiAddress = -1; twi.completeStart(); }
      else if (request.control & 0x10) { this.twiAddress = -1; twi.completeStop(); }
      else if (request.status === 8 || request.status === 16) {
        this.twiAddress = request.data >> 1;
        twi.completeConnect(this.onTwiAddress(this.twiAddress, !(request.data & 1)));
      } else if (request.status === 0x18 || request.status === 0x28) twi.completeWrite(this.onTwiByte(this.twiAddress, request.data));
      else if (request.status === 0x40 || request.status === 0x50) twi.completeRead(255);
    });
    this.callbacks.set('adc', () => this.adc.completeADCRead(this.adcResult));
    this.callbacks.set('usart-tx', () => {
      const interrupts = usart as unknown as { UDRE: Interrupt; TXC: Interrupt };
      cpu.setInterruptFlag(interrupts.UDRE); cpu.setInterruptFlag(interrupts.TXC);
    });
    this.callbacks.set('eeprom-enable', () => { cpu.data[0x3f] &= ~4; });
    this.callbacks.set('eeprom-ready', () => cpu.setInterruptFlag((eeprom as unknown as { EER: Interrupt }).EER));
    const addClockEvent = cpu.addClockEvent.bind(cpu);
    cpu.addClockEvent = (callback, cycles) => {
      let pending = 0;
      for (let event = (cpu as unknown as CpuSnapshotAccess).nextClockEvent; event; event = event.next) {
        if (++pending >= 64) throw new Error('Firmware scheduled too many pending peripheral events.');
      }
      const id = this.clockContext === 'eeprom' ? (cycles === 4 ? 'eeprom-enable' : 'eeprom-ready') : this.clockContext;
      const eventCycles = id === 'twi' ? Math.max(1, Math.round(NANO_CLOCK_HZ / twi.sclFrequency * ((this.pendingTwi?.control ?? 0) & 0x30 ? 1 : 9))) : cycles;
      return addClockEvent(id ? this.callbacks.get(id)! : callback, eventCycles);
    };
    for (const [address, context] of [[adcConfig.ADCSRA, 'adc'], [usart0Config.UDR, 'usart-tx'], [0x3f, 'eeprom']] as const) {
      const hook = cpu.writeHooks[address];
      cpu.writeHooks[address] = (...args) => {
        this.clockContext = context;
        if (context === 'adc' && !(args[0] & 0x80)) this.adcResult = 0;
        try { return hook(...args); } finally { this.clockContext = ''; }
      };
    }
    this.adc.onADCRead = (input) => {
      this.settleInputs();
      const ground = this.readPin(4);
      this.adc.avcc = this.readPin(27) - ground;
      this.adc.aref = this.readPin(18) - ground;
      const volts = input.type === ADCMuxInputType.SingleEnded ? this.readPin(19 + input.channel) - ground
        : input.type === ADCMuxInputType.Constant ? input.voltage : 0;
      if (input.type === ADCMuxInputType.Differential || input.type === ADCMuxInputType.Temperature) throw new Error('This ADC input mode is not simulated.');
      if (!(this.adc.referenceVoltage > 0)) throw new Error('The ADC reference has no positive voltage. Connect AREF or select the default reference.');
      this.adcResult = Math.max(0, Math.min(1023, Math.floor(volts / this.adc.referenceVoltage * 1024)));
      cpu.addClockEvent(this.callbacks.get('adc')!, this.adc.sampleCycles);
    };
    usart.onByteTransmit = (byte) => { this.serialOutput = (this.serialOutput + String.fromCharCode(byte)).slice(-MAX_SERIAL_CHARACTERS); };
    const twiHook = cpu.writeHooks[twiConfig.TWCR];
    cpu.writeHooks[twiConfig.TWCR] = (...args) => {
      if (!(args[0] & 4)) {
        cpu.clearClockEvent(this.callbacks.get('twi')!);
        this.pendingTwi = undefined; this.twiAddress = -1;
      } else if ((args[0] & 0x84) === 0x84) {
        // A transfer owns its latched control/data until completion. Merely changing
        // interrupt-enable bits must not replace that snapshot's pending transaction.
        if (this.pendingTwi) throw new Error('TWI transfer restarted before completion.');
        this.pendingTwi = { control: args[0], status: cpu.data[twiConfig.TWSR] & 0xf8, data: cpu.data[twiConfig.TWDR] };
      }
      this.clockContext = 'twi';
      try { return twiHook(...args); } finally { this.clockContext = ''; }
    };
    // Unsupported peripherals fail explicitly instead of leaving firmware in an unexplained busy loop.
    for (const [address, mask, name] of [[0x4c, 0x40, 'hardware SPI'], [0x60, 0x48, 'watchdog'], [0x57, 1, 'self-programming flash'], [0x61, 0x8f, 'clock prescaling']] as const) {
      cpu.writeHooks[address] = (value) => { if (value & mask) throw new Error(`${name} is not supported by this Nano runtime.`); };
    }
    const adcHook = cpu.writeHooks[adcConfig.ADCSRA];
    cpu.writeHooks[adcConfig.ADCSRA] = (...args) => {
      if (args[0] & 0x20) throw new Error('ADC auto-trigger mode is not supported; use single analogRead conversions.');
      return adcHook(...args);
    };
    for (const config of [portBConfig, portCConfig, portDConfig]) {
      cpu.readHooks[config.PIN] = () => { this.settleInputs(); this.sampleInputs(); return cpu.data[config.PIN]; };
    }
    if (previous) {
      cpu.data.set(previous.data); cpu.pc = previous.pc; cpu.cycles = previous.cycles;
      previous.peripherals.forEach((value, i) => Object.assign(this.peripherals[i], value));
      const internals = cpu as unknown as CpuSnapshotAccess;
      internals.pendingInterrupts = previous.pendingInterrupts.map((value) => value ? { ...value } : null);
      cpu.nextInterrupt = previous.nextInterrupt; cpu.maxInterrupt = previous.maxInterrupt;
      let next: ClockEvent | null = null;
      for (const event of [...previous.clockEvents].reverse()) {
        const callback = this.callbacks.get(event.id);
        if (!callback) throw new Error('Unknown AVR clock event in runtime snapshot.');
        next = { cycles: event.cycles, callback, next };
      }
      internals.nextClockEvent = next;
      timers.forEach((timer, i) => {
        const config = timerConfigs[i];
        const clockMode = cpu.data[config.TCCRB] & 7;
        if (config.externalClockPort && clockMode >= 6) {
          const access = timer as unknown as TimerSnapshotAccess;
          access.externalClockPort = cpu.gpioByPort[config.externalClockPort];
          access.externalClockPort.externalClockListeners[config.externalClockPin] = access.externalClockCallback;
        }
      });
      this.adcResult = previous.adcResult;
      this.nextInputCycle = previous.nextInputCycle;
      this.eeprom.memory.set(previous.eeprom);
      this.serialOutput = previous.serialOutput;
      this.twiAddress = previous.twiAddress ?? -1;
      this.pendingTwi = previous.pendingTwi ? { ...previous.pendingTwi } : undefined;
    }
  }

  connect(readPin: (pin: number) => number, settleInputs: () => void): void {
    this.readPin = readPin; this.settleInputs = settleInputs; this.sampleInputs();
  }

  sampleInputs(): void {
    const ground = this.readPin(4); const supply = this.readPin(27) - ground;
    for (const [pin, port, bit] of NANO_GPIO) this.ports[port].setPin(bit, this.readPin(pin) - ground >= supply * 0.6);
  }

  outputs(): number[] { return NANO_GPIO.map(([, port, bit]) => this.ports[port].pinState(bit)); }

  step(): void {
    if (this.cpu.cycles >= this.nextInputCycle) {
      this.settleInputs(); this.sampleInputs();
      this.nextInputCycle = (Math.floor(this.cpu.cycles / 800) + 1) * 800;
    }
    const opcode = this.cpu.progMem[this.cpu.pc];
    if (opcode === undefined || opcode === 0xffff) throw new Error(`Execution reached empty flash at 0x${(this.cpu.pc * 2).toString(16)}.`);
    if ([0x9588, 0x9598, 0x95e8, 0x95f8].includes(opcode)) throw new Error('SLEEP, BREAK and self-programming instructions are not supported by this runtime.');
    avrInstruction(this.cpu); this.cpu.tick();
  }

  snapshot(): NanoAvrSnapshot {
    const internals = this.cpu as unknown as CpuSnapshotAccess;
    const ids = new Map([...this.callbacks].map(([id, callback]) => [callback, id]));
    const clockEvents: NanoAvrSnapshot['clockEvents'] = [];
    for (let event = internals.nextClockEvent; event; event = event.next) {
      const id = ids.get(event.callback);
      if (!id || clockEvents.length >= 64) throw new Error('Unsupported or excessive AVR clock events.');
      clockEvents.push({ id, cycles: event.cycles });
    }
    return { data: this.cpu.data.slice(), pc: this.cpu.pc, cycles: this.cpu.cycles, nextInputCycle: this.nextInputCycle,
      twiAddress: this.twiAddress, pendingTwi: this.pendingTwi ? { ...this.pendingTwi } : undefined,
      pendingInterrupts: internals.pendingInterrupts.map((value) => value ? { ...value } : null),
      nextInterrupt: this.cpu.nextInterrupt, maxInterrupt: this.cpu.maxInterrupt,
      peripherals: this.peripherals.map(primitiveState), clockEvents, adcResult: this.adcResult,
      eeprom: this.eeprom.memory.slice(), serialOutput: this.serialOutput, outputStates: this.outputs() };
  }
}
