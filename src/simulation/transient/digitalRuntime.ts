import type { DigitalDevice, DigitalState } from '../../domain/circuit/digital';
import type { Circuit, ElectricalComponent, TransientFrame, TransientState } from '../../domain/circuit/types';
import { createAttiny85Runtime, stepAttiny85 } from '../microcontroller/attiny85Runtime';
import { THERMOMETER_HEX } from '../microcontroller/thermometerFirmware';
import { sampleNanoExample } from '../microcontroller/nanoExamples';
import { NANO_PROGRAM_IDS } from '../../domain/components/arduinoNano';
import { NanoAvrRuntime, NANO_CLOCK_HZ, NANO_GPIO, PinState } from '../microcontroller/nanoAvrRuntime';
import { create74hc595State, hc595InputLevel, step74hc595 } from '../models/shiftRegister74hc595';
import { emptySimulationResult } from '../mna';
import { flattenCircuit } from '../subcircuits';
import { canRetainOperatingPoint, reduceResistivePins } from './resistivePins';

type AnalogStep = (circuit: Circuit, state: TransientState, elapsedSeconds: number) => TransientFrame;
const PORT_PINS = [5, 6, 7, 2, 3, 1];
const REGISTER_OUTPUT_PINS = [15, 1, 2, 3, 4, 5, 6, 7];
const MAX_INSTRUCTIONS_PER_STEP = 100_000;

export function createDigitalState(devices: readonly DigitalDevice[], previous?: DigitalState): DigitalState {
  const mcus: DigitalState['mcus'] = {};
  const registers: DigitalState['registers'] = {};
  const nanos: DigitalState['nanos'] = {};
  for (const device of devices) {
    if (device.kind === 'arduino-nano' && device.programId) {
      const old = previous?.nanos?.[device.id];
      nanos[device.id] = old?.programId === device.programId && old.firmwareHex === device.firmware?.hex ? { ...old }
        : { programId: device.programId, powered: false, outputHigh: false, nextTimeSeconds: 0, startedAtSeconds: 0, firmwareHex: device.firmware?.hex };
    } else if (device.kind === '74hc595') registers[device.id] = previous?.registers[device.id] ?? create74hc595State();
    else if (device.firmwareId === 'thermometer-v1') {
      const old = previous?.mcus[device.id];
      mcus[device.id] = old ? { ...old, cpu: { ...old.cpu, registers: old.cpu.registers.slice(), sram: old.cpu.sram.slice() } }
        : { cpu: createAttiny85Runtime(THERMOMETER_HEX), nextTimeSeconds: 0, powered: false };
    }
  }
  return { mcus, registers, nanos };
}

function voltage(voltages: Record<string, number>, device: DigitalDevice, pin: number): number {
  return voltages[device.pins[`pin${pin}`]] ?? 0;
}

function supply(voltages: Record<string, number>, device: DigitalDevice): number {
  return voltage(voltages, device, device.kind === 'arduino-nano' ? 27 : device.kind === 'attiny85' ? 8 : 16)
    - voltage(voltages, device, device.kind === '74hc595' ? 8 : 4);
}

function powered(voltages: Record<string, number>, device: DigitalDevice): boolean {
  const vcc = supply(voltages, device);
  return vcc >= 2.7 && vcc <= 5.5;
}

function stampDevices(circuit: Circuit, digital: DigitalState, voltages: Record<string, number>): Circuit {
  const components: ElectricalComponent[] = [...circuit.components];
  for (const device of circuit.digitalDevices ?? []) {
    const groundPin = device.kind === '74hc595' ? 8 : 4;
    const supplyPin = device.kind === 'arduino-nano' ? 27 : device.kind === 'attiny85' ? 8 : 16;
    const ground = device.pins[`pin${groundPin}`];
    const vcc = device.pins[`pin${supplyPin}`];
    const resistor = (name: string, pin: number, to: string, resistanceOhms: number) => components.push({
      id: `@digital/${device.id}/${name}`, kind: 'resistor', positiveNodeId: device.pins[`pin${pin}`], negativeNodeId: to, resistanceOhms,
    });
    resistor('supply', supplyPin, ground, 100_000);
    // Weak input leakage gives disconnected pins a deterministic low educational state.
    for (const pin of Object.keys(device.pins)) {
      if (pin !== `pin${groundPin}` && pin !== `pin${supplyPin}`) resistor(`leak-${pin}`, Number(pin.slice(3)), ground, 100e6);
    }
    if (!powered(voltages, device)) continue;
    if (device.kind === 'arduino-nano') {
      const nano = digital.nanos[device.id];
      if (nano?.powered) {
        if (nano.programId === 'custom') {
          NANO_GPIO.forEach(([pin], index) => {
            const output = nano.avr?.outputStates[index];
            if (output === PinState.High || output === PinState.Low) resistor(`gpio-${pin}`, pin, output === PinState.High ? vcc : ground, 50);
            else if (output === PinState.InputPullUp) resistor(`pullup-${pin}`, pin, vcc, 30_000);
          });
        } else resistor('d13', 16, nano.outputHigh ? vcc : ground, 50);
        if (nano.programId === 'button-led') resistor('pullup-d2', 5, vcc, 30_000);
      }
    } else if (device.kind === 'attiny85') {
      const mcu = digital.mcus[device.id];
      if (!mcu?.powered) continue;
      PORT_PINS.forEach((pin, bit) => {
        if (mcu.cpu.sram[0x17] & (1 << bit)) resistor(`gpio-${bit}`, pin, mcu.cpu.sram[0x18] & (1 << bit) ? vcc : ground, 50);
      });
    } else {
      const state = digital.registers[device.id];
      const level = (pin: number) => hc595InputLevel(voltage(voltages, device, pin), voltage(voltages, device, groundPin), voltage(voltages, device, supplyPin));
      if (level(13) === 'low') REGISTER_OUTPUT_PINS.forEach((pin, bit) => resistor(`q-${bit}`, pin, state.outputBits[bit] ? vcc : ground, 50));
      resistor('cascade', 9, state.shiftBits[7] ? vcc : ground, 50);
    }
  }
  return { ...circuit, components, digitalDevices: [] };
}

/** Every register samples the same pre-edge solution, including cascaded serial data. */
function sampleRegisters(devices: readonly DigitalDevice[], digital: DigitalState, voltages: Record<string, number>): boolean {
  let changed = false;
  for (const device of devices) {
    if (device.kind !== '74hc595') continue;
    const old = digital.registers[device.id];
    const input = (pin: number) => hc595InputLevel(voltage(voltages, device, pin), voltage(voltages, device, 8), voltage(voltages, device, 16));
    const next = powered(voltages, device) ? step74hc595(old, {
      data: input(14), shiftClock: input(11), latchClock: input(12), clear: input(10), outputEnable: input(13),
    }) : create74hc595State();
    changed ||= next.shiftBits.some((bit, i) => bit !== old.shiftBits[i]) || next.outputBits.some((bit, i) => bit !== old.outputBits[i]);
    digital.registers[device.id] = next;
  }
  return changed;
}

export function stepDigitalCircuit(circuit: Circuit, state: TransientState, elapsedSeconds: number, analogStep: AnalogStep): TransientFrame {
  const devices = circuit.digitalDevices ?? [];
  // Nano input polls can invoke an analogue solve; bound them separately from cheap AVR instructions.
  if (devices.filter((device) => device.kind === 'arduino-nano').length * Math.ceil(elapsedSeconds / 0.001) > 5_000) {
    return { state, result: emptySimulationResult([{ code: 'DIGITAL_STEP_BUDGET', message: 'Use a smaller timestep for the Nano examples (at most 5,000 input polls per step).' }]) };
  }
  const invalidNano = devices.find((device) => device.kind === 'arduino-nano' && (!device.programId || (device.programId === 'custom' ? !device.firmware : !NANO_PROGRAM_IDS.includes(device.programId))));
  if (invalidNano) return { state, result: emptySimulationResult([{ code: 'UNSUPPORTED_FIRMWARE', message: `${invalidNano.id} needs a supported Nano example or compiled firmware.`, componentId: invalidNano.id }]) };
  const invalid = devices.find((device) => device.kind === 'attiny85'
    && (device.firmwareId !== 'thermometer-v1' || !Number.isFinite(device.clockHz) || device.clockHz! <= 0));
  if (invalid) return { state, result: emptySimulationResult([{ code: 'UNSUPPORTED_FIRMWARE', message: `${invalid.id} needs supported firmware and a positive clock frequency.`, componentId: invalid.id }]) };
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return analogStep({ ...circuit, digitalDevices: [] }, state, elapsedSeconds);
  const digital = createDigitalState(devices, state.digital);
  const customDevices = devices.filter((device) => device.kind === 'arduino-nano' && device.programId === 'custom');
  if (customDevices.length * elapsedSeconds * NANO_CLOCK_HZ > MAX_INSTRUCTIONS_PER_STEP) {
    return { state, result: emptySimulationResult([{ code: 'DIGITAL_STEP_BUDGET', message: 'Use a timestep of 5 ms or smaller for one Nano running custom firmware; reduce it further for multiple Nanos.' }]) };
  }
  const firmwareError = (error: unknown, componentId?: string): TransientFrame => ({ state, result: emptySimulationResult([{ code: 'NANO_FIRMWARE_ERROR', message: error instanceof Error ? error.message : 'Nano firmware execution failed.', componentId }]) });
  const avrRuntimes = new Map<string, NanoAvrRuntime>();
  const baseCircuit = flattenCircuit(circuit);
  let frame: TransientFrame;
  const hasError = () => frame.result.status === 'error';
  let voltages = state.nodeVoltages ?? {};
  let analogState = state;
  const displayCurrentsA = { ...state.displayCurrentsA };
  let previousKey = '';
  let previousResult: TransientFrame['result'] | undefined;
  let previousSteady = false;
  const solve = (dt: number) => {
    const actualDt = Math.max(1e-10, dt);
    const reduction = reduceResistivePins(stampDevices(baseCircuit, digital, voltages));
    const key = JSON.stringify(reduction.circuit.components);
    const steady = canRetainOperatingPoint(reduction.circuit, reduction.fixedVoltages, analogState.capacitorVoltages);
    if (steady && previousSteady && previousResult && key === previousKey) {
      const componentCurrents = { ...previousResult.componentCurrents };
      const componentPowers = { ...previousResult.componentPowers };
      for (const part of reduction.circuit.components) if (part.kind === 'capacitor') {
        componentCurrents[part.id] = 0; componentPowers[part.id] = 0;
      }
      frame = { state: { ...analogState, timeSeconds: analogState.timeSeconds + actualDt }, result: { ...previousResult, componentCurrents, componentPowers } };
    } else frame = analogStep(reduction.circuit, analogState, actualDt);
    previousKey = key;
    previousSteady = steady;
    previousResult = frame.result.status === 'error' ? undefined : frame.result;
    frame = { ...frame, result: reduction.restore(frame.result) };
    frame.state = { ...frame.state, nodeVoltages: frame.result.nodeVoltages };
    if (frame.result.status === 'error') return;
    voltages = frame.result.nodeVoltages;
    if (dt > 0) {
      const blend = -Math.expm1(-dt / 0.04);
      for (const [id, current] of Object.entries(frame.result.componentCurrents)) {
        if (!id.includes(':')) continue;
        displayCurrentsA[id] = (displayCurrentsA[id] ?? 0) * (1 - blend) + Math.max(0, current) * blend;
      }
      analogState = frame.state;
    } else analogState = { ...analogState, nodeVoltages: voltages };
  };
  // Settle supply before executing instructions. Re-run with enabled output stages.
  solve(0);
  if (hasError()) return { state, result: frame!.result };
  for (const device of devices) {
    if (device.kind === 'arduino-nano') {
      const nano = digital.nanos[device.id];
      const active = supply(voltages, device) >= 4.5 && supply(voltages, device) <= 5.5
        && voltage(voltages, device, 3) - voltage(voltages, device, 4) >= supply(voltages, device) * 0.6;
      if (!active || !nano.powered) {
        nano.startedAtSeconds = state.timeSeconds;
        nano.nextTimeSeconds = state.timeSeconds;
        nano.outputHigh = false;
        nano.eeprom = nano.avr?.eeprom ?? nano.eeprom;
        nano.avr = undefined;
      }
      nano.powered = active;
      continue;
    }
    if (device.kind !== 'attiny85') continue;
    const mcu = digital.mcus[device.id];
    const groundV = voltage(voltages, device, 4);
    const resetHigh = hc595InputLevel(voltage(voltages, device, 1), groundV, voltage(voltages, device, 8)) === 'high';
    const active = powered(voltages, device) && resetHigh;
    if (!active) {
      mcu.cpu = createAttiny85Runtime(THERMOMETER_HEX);
      mcu.nextTimeSeconds = state.timeSeconds;
    } else if (!mcu.powered) mcu.nextTimeSeconds = state.timeSeconds;
    mcu.powered = active;
  }
  sampleRegisters(devices, digital, voltages);
  solve(0);
  if (hasError()) return { state, result: frame!.result };
  let inputSettles = 0;
  for (const device of customDevices) {
    const nano = digital.nanos[device.id];
    if (!nano.powered) continue;
    try {
      const runtime = new NanoAvrRuntime(device.firmware!.hex, nano.avr, nano.eeprom);
      runtime.connect((pin) => voltage(voltages, device, pin), () => {
        if (++inputSettles > 2_000) throw new Error('Firmware reads inputs too frequently for this timestep. Reduce the simulation timestep.');
        const eventTime = nano.startedAtSeconds + runtime.cpu.cycles / NANO_CLOCK_HZ;
        if (eventTime > analogState.timeSeconds) solve(eventTime - analogState.timeSeconds);
        if (hasError()) throw new Error(frame.result.errors[0]?.message ?? 'Electrical simulation failed.');
      });
      nano.avr = runtime.snapshot();
      avrRuntimes.set(device.id, runtime);
    } catch (error) { return firmwareError(error, device.id); }
  }
  const runningDevices = devices.filter((device) => device.kind === 'attiny85' && digital.mcus[device.id]?.powered);
  if (runningDevices.length && (elapsedSeconds > 0.01
    || runningDevices.reduce((sum, device) => sum + elapsedSeconds * device.clockHz!, 0) > MAX_INSTRUCTIONS_PER_STEP)) {
    return { state, result: emptySimulationResult([{ code: 'DIGITAL_STEP_BUDGET', message: 'Use a timestep of 10 ms or less and reduce the MCU clock if necessary; the digital execution budget was exceeded.' }]) };
  }
  const endTime = state.timeSeconds + elapsedSeconds;
  const nanoDevices = devices.filter((device) => device.kind === 'arduino-nano');
  let instructions = 0;
  while (true) {
    const nextDevice = runningDevices.reduce<DigitalDevice | undefined>((best, device) => !best || digital.mcus[device.id].nextTimeSeconds < digital.mcus[best.id].nextTimeSeconds ? device : best, undefined);
    const nextNano = nanoDevices.reduce<DigitalDevice | undefined>((best, device) => !best || digital.nanos[device.id].nextTimeSeconds < digital.nanos[best.id].nextTimeSeconds ? device : best, undefined);
    if (nextNano && digital.nanos[nextNano.id].nextTimeSeconds < endTime
      && (!nextDevice || digital.nanos[nextNano.id].nextTimeSeconds <= digital.mcus[nextDevice.id].nextTimeSeconds)) {
      if (++instructions > MAX_INSTRUCTIONS_PER_STEP) return { state, result: emptySimulationResult([{ code: 'DIGITAL_STEP_BUDGET', message: 'Use a smaller timestep for the Nano examples.' }]) };
      const nano = digital.nanos[nextNano.id];
      const eventTime = Math.max(analogState.timeSeconds, nano.nextTimeSeconds);
      if (nextNano.programId === 'custom') {
        const runtime = avrRuntimes.get(nextNano.id);
        if (!runtime) { nano.nextTimeSeconds = endTime; continue; }
        try {
          const beforeCycles = runtime.cpu.cycles;
          runtime.step();
          nano.nextTimeSeconds += (runtime.cpu.cycles - beforeCycles) / NANO_CLOCK_HZ;
          if (runtime.outputsChanged) {
            if (++inputSettles > 2_000) throw new Error('Firmware switches outputs too frequently for this timestep. Reduce the simulation timestep.');
            if (eventTime > analogState.timeSeconds) solve(eventTime - analogState.timeSeconds);
            nano.avr = { ...nano.avr!, outputStates: runtime.outputs() };
            solve(0);
            if (hasError()) return { state, result: frame!.result };
            sampleRegisters(devices, digital, voltages); solve(0);
            if (hasError()) return { state, result: frame!.result };
            runtime.sampleInputs(); runtime.outputsChanged = false;
          }
        } catch (error) { return firmwareError(error, nextNano.id); }
        continue;
      }
      if (eventTime > analogState.timeSeconds) solve(eventTime - analogState.timeSeconds);
      if (hasError()) return { state, result: frame!.result };
      sampleNanoExample(nextNano, nano, eventTime, (pin) => voltage(voltages, nextNano, pin));
      solve(0);
      if (hasError()) return { state, result: frame!.result };
      sampleRegisters(devices, digital, voltages);
      solve(0);
      if (hasError()) return { state, result: frame!.result };
      continue;
    }
    if (!nextDevice) break;
    const mcu = digital.mcus[nextDevice.id];
    if (mcu.nextTimeSeconds >= endTime) break;
    if (++instructions > MAX_INSTRUCTIONS_PER_STEP) return { state, result: emptySimulationResult([{ code: 'DIGITAL_STEP_BUDGET', message: 'Use a smaller timestep or slower MCU clock: the instruction budget was exceeded.' }]) };
    const beforePort = mcu.cpu.sram[0x18];
    const beforeDdr = mcu.cpu.sram[0x17];
    const beforeCycles = mcu.cpu.cycles;
    const eventTime = Math.max(analogState.timeSeconds, mcu.nextTimeSeconds);
    const groundV = voltage(voltages, nextDevice, 4);
    stepAttiny85(mcu.cpu, {
      readPinVoltageV: (bit) => voltage(voltages, nextDevice, PORT_PINS[bit]) - groundV,
      supplyVoltageV: () => supply(voltages, nextDevice), drivePin: () => {},
    }, true);
    mcu.nextTimeSeconds += (mcu.cpu.cycles - beforeCycles) / nextDevice.clockHz!;
    if (mcu.cpu.halted) return { state, result: emptySimulationResult([{ code: 'UNSUPPORTED_AVR_INSTRUCTION', message: `${nextDevice.id} halted at unsupported firmware instruction ${mcu.cpu.programCounter - 1}.`, componentId: nextDevice.id }]) };
    if (beforePort !== mcu.cpu.sram[0x18] || beforeDdr !== mcu.cpu.sram[0x17]) {
      // Integrate the previous electrical output until this GPIO transition.
      const newPort = mcu.cpu.sram[0x18]; const newDdr = mcu.cpu.sram[0x17];
      mcu.cpu.sram[0x18] = beforePort; mcu.cpu.sram[0x17] = beforeDdr;
      if (eventTime > analogState.timeSeconds) solve(eventTime - analogState.timeSeconds);
      mcu.cpu.sram[0x18] = newPort; mcu.cpu.sram[0x17] = newDdr;
      solve(0);
      if (hasError()) return { state, result: frame!.result };
      sampleRegisters(devices, digital, voltages);
      solve(0); // Settle changed output enables as well as shift/latch state.
      if (hasError()) return { state, result: frame!.result };
    }
  }
  if (endTime > analogState.timeSeconds) solve(endTime - analogState.timeSeconds);
  if (hasError()) return { state, result: frame!.result };
  // External signal sources may clock a register even when there is no MCU.
  sampleRegisters(devices, digital, voltages);
  solve(0);
  if (hasError()) return { state, result: frame!.result };
  for (const [id, runtime] of avrRuntimes) {
    try { digital.nanos[id].avr = runtime.snapshot(); } catch (error) { return firmwareError(error, id); }
  }
  return { state: { ...analogState, timeSeconds: endTime, digital, displayCurrentsA }, result: { ...frame!.result, displayCurrentsA } };
}
