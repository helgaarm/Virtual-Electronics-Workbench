import { describe, expect, it } from 'vitest';
import { createOledState, oledByte, connectedOled, oledDisplays, oledTransaction } from '../../src/simulation/models/oled';
import { createStarterProject } from '../../src/domain/starterProjects';
import { extractCircuit } from '../../src/simulation/circuitBuilder';
import { createTransientState, stepTransient } from '../../src/simulation';
import { NanoAvrRuntime } from '../../src/simulation/microcontroller/nanoAvrRuntime';
import { firmwareHex } from '../fixtures/nanoFirmware';
import { measureComponent } from '../../src/measurement/dcMeasurements';

describe('OLED controller and connected I2C bus', () => {
  it('handles split command parameters, page offset, horizontal/vertical windows and Co control bytes', () => {
    const sh = createOledState();
    for (const bytes of [[0, 0xaf, 0xb2, 2, 0x10], [0x40, 0x55, 0xaa]]) {
      sh.expectsControl = true; bytes.forEach(byte => oledByte(sh, byte, 'sh1106'));
    }
    expect(sh.enabled).toBe(true); expect(sh.ram[2 * 132 + 2]).toBe(0x55);
    const state = createOledState();
    for (const bytes of [[0, 0x20], [0, 0, 0x21, 4, 5, 0x22, 2, 3], [0x40, 1, 2, 3, 4]]) {
      state.expectsControl = true; bytes.forEach(byte => oledByte(state, byte, 'ssd1306'));
    }
    expect([...state.ram.slice(268, 270)]).toEqual([1, 2]);
    expect([...state.ram.slice(400, 402)]).toEqual([3, 4]);
    for (const bytes of [[0, 0x20, 1, 0x21, 4, 5, 0x22, 2, 3], [0x40, 5, 6, 7, 8], [0x80, 0xaf, 0, 0xa7]]) {
      state.expectsControl = true; bytes.forEach(byte => oledByte(state, byte, 'ssd1306'));
    }
    expect([...state.ram.slice(268, 270)]).toEqual([5, 7]);
    expect([...state.ram.slice(400, 402)]).toEqual([6, 8]);
    expect(state.enabled && state.inverted).toBe(true);
  });

  it('NACKs wrong address, power loss, shorts, duplicate addresses and disconnected SDA/SCL', () => {
    const project = createStarterProject('wind-constant-power');
    const circuit = extractCircuit(project).circuit;
    const frame = stepTransient(circuit, createTransientState(circuit), 0.01);
    const device = circuit.digitalDevices![0], display = circuit.oleds![0], volts = frame.result.nodeVoltages;
    const reading = measureComponent(project.components.find(c => c.id === display.id)!, extractCircuit(project), frame.result);
    expect(reading.voltage.value).toBeCloseTo(5, 6);
    expect(reading.current.value).toBeCloseTo(0.02, 6);
    expect(connectedOled(circuit, device, 60, volts)?.id).toBe('OLED1');
    expect(connectedOled(circuit, device, 61, volts)).toBeUndefined();
    for (const pins of [
      { ...display.pins, sda: 'missing' }, { ...display.pins, scl: 'missing' },
      { ...display.pins, vcc: display.pins.gnd }, { ...display.pins, sda: display.pins.scl },
    ]) expect(connectedOled({ ...circuit, oleds: [{ ...display, pins }] }, device, 60, volts)).toBeUndefined();
    expect(connectedOled({ ...circuit, oleds: [display, { ...display, id: 'duplicate' }] }, device, 60, volts)).toBeUndefined();
    const digital = frame.state.digital!;
    expect(oledTransaction(circuit, digital, device, 60, [0, 0xaf, 0xb0, 2, 0x10], volts)).toBe(true);
    expect(oledTransaction(circuit, digital, device, 60, [0x40, 0x81], volts)).toBe(true);
    expect(oledDisplays(circuit, digital, volts)!.OLED1.pixels[0]).toBe(0x81);
    const off = { ...volts, [display.pins.vcc]: volts[display.pins.gnd] };
    expect(oledDisplays(circuit, digital, off)!.OLED1.pixels.some(Boolean)).toBe(false);
    expect(oledDisplays(circuit, digital, volts)!.OLED1.powered).toBe(false);
  });
});

describe('Nano TWI snapshot adapter', () => {
  const hex = firmwareHex([0xcfff]); // Original infinite-loop program; drive peripheral registers below.
  const until = (runtime: NanoAvrRuntime, cycle: number) => { while (runtime.cpu.cycles < cycle) runtime.step(); };
  const connect = (runtime: NanoAvrRuntime) => {
    runtime.connect(pin => pin === 27 ? 5 : 0, () => {});
    runtime.onTwiAddress = (address, write) => address === 60 && write;
    runtime.onTwiByte = (address, byte) => address === 60 && byte === 0x55;
  };
  it('restores a pending address and data transfer and reports ACK/NACK at bus timing', () => {
    const original = new NanoAvrRuntime(hex); connect(original);
    original.cpu.writeData(0xb8, 72); // 100 kHz: 160 cycles per bit.
    original.cpu.writeData(0xbc, 0xa4); until(original, 180);
    expect(original.cpu.data[0xb9] & 0xf8).toBe(8);
    original.cpu.writeData(0xbb, 120); original.cpu.writeData(0xbc, 0x84);
    until(original, 210); expect(original.snapshot().clockEvents.some(e => e.id === 'twi')).toBe(true);
    const checkpoint = structuredClone(original.snapshot());
    const resumed = new NanoAvrRuntime(hex, checkpoint); connect(resumed);
    until(original, 1800); until(resumed, 1800);
    expect(resumed.snapshot()).toEqual(original.snapshot());
    expect(original.cpu.data[0xb9] & 0xf8).toBe(0x18);
    original.cpu.writeData(0xbb, 0x55); original.cpu.writeData(0xbc, 0x84);
    const dataResume = new NanoAvrRuntime(hex, structuredClone(original.snapshot())); connect(dataResume);
    until(original, 3300); until(dataResume, 3300);
    expect(dataResume.snapshot()).toEqual(original.snapshot());
    expect(original.cpu.data[0xb9] & 0xf8).toBe(0x28);
    original.cpu.writeData(0xbb, 0x33); original.cpu.writeData(0xbc, 0x84); until(original, 4800);
    expect(original.cpu.data[0xb9] & 0xf8).toBe(0x30);
  });
  it('NACKs unknown addresses and cancels a pending transfer when TWI is disabled', () => {
    const runtime = new NanoAvrRuntime(hex); connect(runtime);
    runtime.cpu.writeData(0xb8, 72); runtime.cpu.writeData(0xbc, 0xa4); until(runtime, 180);
    runtime.cpu.writeData(0xbb, 122); runtime.cpu.writeData(0xbc, 0x84); until(runtime, 1800);
    expect(runtime.cpu.data[0xb9] & 0xf8).toBe(0x20);
    runtime.cpu.writeData(0xbc, 0xa4); runtime.cpu.writeData(0xbc, 0);
    expect(runtime.snapshot().pendingTwi).toBeUndefined();
    expect(runtime.snapshot().clockEvents.some(e => e.id === 'twi')).toBe(false);
  });
});
