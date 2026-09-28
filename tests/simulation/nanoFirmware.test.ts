import { describe, expect, it } from 'vitest';
import { parseNanoHex, MAX_NANO_HEX_CHARACTERS } from '../../src/domain/components/nanoFirmware';
import { arduinoNanoProject } from '../../src/domain/starters/arduinoNano';
import { migrateProjectDocument } from '../../src/persistence/migrations';
import { NanoAvrRuntime, PinState } from '../../src/simulation/microcontroller/nanoAvrRuntime';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientState, stepTransient } from '../../src/simulation';
import { EEPROM_COUNTER_HEX, GPIO_SERIAL_ADC_HEX, TIMER_PWM_HEX, UNSUPPORTED_SPI_HEX, hexRecord, firmwareHex } from '../fixtures/nanoFirmware';

function connect(runtime: NanoAvrRuntime, analogV = 3.5) { runtime.connect((pin) => pin === 27 || pin === 3 ? 5 : pin === 19 ? analogV : 0, () => {}); }
function until(runtime: NanoAvrRuntime, cycles: number) { while (runtime.cpu.cycles < cycles) runtime.step(); }
function projectWith(hex = GPIO_SERIAL_ADC_HEX) {
  const project = arduinoNanoProject('blink');
  project.components = project.components.map((part) => part.kind === 'arduino-nano' ? { ...part, programId: 'custom', firmware: { name: 'custom.hex', hex } } : part);
  return project;
}

describe('Nano firmware import boundary', () => {
  it('reads a bounded Intel HEX image and validates checksums, address records and EOF', () => {
    const valid = parseNanoHex(GPIO_SERIAL_ADC_HEX);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.bytes.length).toBe(32768);
    expect(parseNanoHex(GPIO_SERIAL_ADC_HEX.replace(/^:10/, ':11')).ok).toBe(false);
    expect(parseNanoHex(GPIO_SERIAL_ADC_HEX.replace(/:00000001FF$/, '')).ok).toBe(false);
    expect(parseNanoHex(GPIO_SERIAL_ADC_HEX + '\n' + hexRecord(0, 0, [0, 0])).ok).toBe(false);
    expect(parseNanoHex(hexRecord(0, 4, [0, 1]) + '\n' + GPIO_SERIAL_ADC_HEX).ok).toBe(false);
    expect(parseNanoHex(hexRecord(0, 0, [0, 0]) + '\n' + GPIO_SERIAL_ADC_HEX).ok).toBe(false);
    expect(parseNanoHex('x'.repeat(MAX_NANO_HEX_CHARACTERS + 1)).ok).toBe(false);
    expect(parseNanoHex(hexRecord(2, 0, [0, 0]) + '\n:00000001FF').ok).toBe(false);
  });
  it('round-trips firmware, upgrades built-in schema-13 projects, and rejects malformed custom programs', () => {
    const project = projectWith();
    expect(migrateProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const old = arduinoNanoProject('blink');
    expect(migrateProjectDocument({ ...old, version: 13 })).toEqual(old);
    expect(() => migrateProjectDocument(projectWith('invalid'))).toThrow(/HEX/);
    expect(() => migrateProjectDocument({ ...project, components: project.components.map((part) => part.kind === 'arduino-nano' ? { ...part, firmware: undefined } : part) })).toThrow(/firmware/);
  });
});

describe('restorable ATmega328P execution', () => {
  it('restores pending EEPROM writes and retains completed data across a Nano power cycle', () => {
    const whole = new NanoAvrRuntime(EEPROM_COUNTER_HEX); connect(whole); until(whole, 60_000);
    const first = new NanoAvrRuntime(EEPROM_COUNTER_HEX); connect(first); until(first, 30);
    expect(first.snapshot().clockEvents.some((event) => event.id === 'eeprom-ready')).toBe(true);
    const continued = new NanoAvrRuntime(EEPROM_COUNTER_HEX, structuredClone(first.snapshot()));
    connect(continued); until(continued, whole.cpu.cycles);
    expect(continued.snapshot()).toEqual(whole.snapshot());
    expect(whole.snapshot().eeprom[0]).toBe(0);
    expect(whole.cpu.data[0x3f] & 2).toBe(0);

    const project = projectWith(EEPROM_COUNTER_HEX);
    const { circuit } = extractCircuit(project);
    const running = stepTransient(circuit, createTransientState(circuit), 0.004);
    expect(running.result.errors).toEqual([]);
    expect(running.state.digital?.nanos.Nano1.avr?.eeprom[0]).toBe(0);
    const offCircuit = extractCircuit({ ...project, powerOn: false }).circuit;
    const off = stepTransient(offCircuit, createTransientState(offCircuit, running.state), 0.001);
    const on = stepTransient(circuit, createTransientState(circuit, off.state), 0.004);
    expect(on.result.errors).toEqual([]);
    expect(on.state.digital?.nanos.Nano1.avr?.eeprom[0]).toBe(1);
    expect(running.state.digital?.nanos.Nano1.avr?.eeprom[0]).toBe(0);
    const reset = stepTransient(circuit, createTransientState(circuit), 0.004);
    expect(reset.state.digital?.nanos.Nano1.avr?.eeprom[0]).toBe(0);
  });
  it('executes GPIO, USART and ADC instructions, including pending events across worker snapshots', () => {
    const whole = new NanoAvrRuntime(GPIO_SERIAL_ADC_HEX); connect(whole); until(whole, 20_000);
    expect(whole.outputs()[5]).toBe(PinState.High);
    expect(whole.cpu.data[0x78] | whole.cpu.data[0x79] << 8).toBe(716);
    expect(whole.snapshot().serialOutput).toBe('A');
    const first = new NanoAvrRuntime(GPIO_SERIAL_ADC_HEX); connect(first); until(first, 30);
    const checkpoint = structuredClone(first.snapshot());
    const continued = new NanoAvrRuntime(GPIO_SERIAL_ADC_HEX, checkpoint); connect(continued); until(continued, whole.cpu.cycles);
    expect(continued.snapshot()).toEqual(whole.snapshot());
    expect(first.snapshot()).toEqual(checkpoint);
  });
  it('preserves timer phase, PWM and overflow interrupts through repeated structured clones', () => {
    const whole = new NanoAvrRuntime(TIMER_PWM_HEX); connect(whole); until(whole, 40_000);
    expect(whole.cpu.data[20]).toBeGreaterThan(0);
    let split = new NanoAvrRuntime(TIMER_PWM_HEX); connect(split);
    const outputLevels = new Set<number>();
    while (split.cpu.cycles < whole.cpu.cycles) {
      until(split, Math.min(split.cpu.cycles + 501, whole.cpu.cycles));
      outputLevels.add(split.outputs()[18]); // D6 / OC0A
      split = new NanoAvrRuntime(TIMER_PWM_HEX, structuredClone(split.snapshot())); connect(split);
    }
    expect(outputLevels.has(PinState.High)).toBe(true);
    expect(outputLevels.has(PinState.Low)).toBe(true);
    expect(split.snapshot()).toEqual(whole.snapshot());
  });
  it('drives real circuit currents and resumes without mutating an earlier transient frame', () => {
    const project = projectWith();
    const { circuit } = extractCircuit(project);
    const initial = createTransientState(circuit); const before = structuredClone(initial);
    const frame = stepTransient(circuit, initial, 0.001);
    expect(frame.result.errors).toEqual([]);
    expect(frame.result.componentCurrents.D1).toBeGreaterThan(0.005);
    expect(initial).toEqual(before);
    const checkpoint = structuredClone(frame);
    const next = stepTransient(circuit, frame.state, 0.001);
    expect(next.result.errors).toEqual([]);
    expect(frame).toEqual(checkpoint);
    expect(stepTransient(circuit, checkpoint.state, 0.001)).toEqual(next);
  });
  it('returns structured errors for unsupported peripherals, invalid firmware and unbounded steps', () => {
    for (const hex of [UNSUPPORTED_SPI_HEX, 'invalid', firmwareHex([0xffff])]) {
      const { circuit } = extractCircuit(projectWith(hex));
      const frame = stepTransient(circuit, createTransientState(circuit), 0.001);
      expect(frame.result.errors[0]?.code).toBe('NANO_FIRMWARE_ERROR');
    }
    const { circuit } = extractCircuit(projectWith());
    expect(stepTransient(circuit, createTransientState(circuit), 0.05).result.errors[0]?.code).toBe('DIGITAL_STEP_BUDGET');
  });
  it('restarts on firmware changes and power cycling', () => {
    const project = projectWith();
    const { circuit } = extractCircuit(project);
    const running = stepTransient(circuit, createTransientState(circuit), 0.001);
    const offCircuit = extractCircuit({ ...project, powerOn: false }).circuit;
    const off = stepTransient(offCircuit, createTransientState(offCircuit, running.state), 0.001);
    expect(off.result.componentCurrents.D1).toBe(0);
    const on = stepTransient(circuit, createTransientState(circuit, off.state), 0.001);
    expect(on.state.digital?.nanos.Nano1.avr?.cycles).toBe(running.state.digital?.nanos.Nano1.avr?.cycles);
    const replacement = extractCircuit(projectWith(TIMER_PWM_HEX)).circuit;
    expect(createTransientState(replacement, running.state).digital?.nanos.Nano1.avr).toBeUndefined();
  });
});
