import type { Circuit, SimulationResult } from '../../domain/circuit/types';
import type { DigitalDevice, DigitalState } from '../../domain/circuit/digital';
import type { OledDevice, OledState } from '../../domain/circuit/oled';

export function createOledState(): OledState {
  return { ram: new Uint8Array(132 * 8), page: 0, column: 0, enabled: false, inverted: false,
    mode: 2, columnStart: 0, columnEnd: 127, pageStart: 0, pageEnd: 7, parameters: [], expectsControl: true };
}
const parameterCounts: Record<number, number> = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0x8d: 1, 0xa8: 1, 0xad: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1 };
function command(state: OledState, value: number): void {
  if (state.pendingCommand !== undefined) {
    state.parameters.push(value);
    if (state.parameters.length < parameterCounts[state.pendingCommand]) return;
    if (state.pendingCommand === 0x20) state.mode = state.parameters[0] & 3;
    if (state.pendingCommand === 0x21) { state.columnStart = Math.min(127, state.parameters[0]); state.columnEnd = Math.max(state.columnStart, Math.min(127, state.parameters[1])); state.column = state.columnStart; }
    if (state.pendingCommand === 0x22) { state.pageStart = state.parameters[0] & 7; state.pageEnd = Math.max(state.pageStart, state.parameters[1] & 7); state.page = state.pageStart; }
    state.pendingCommand = undefined; state.parameters = []; return;
  }
  if (parameterCounts[value]) { state.pendingCommand = value; state.parameters = []; }
  else if ((value & 0xf0) === 0xb0) state.page = value & 7;
  else if ((value & 0xf0) === 0x00) state.column = (state.column & 0xf0) | (value & 15);
  else if ((value & 0xf0) === 0x10) state.column = (state.column & 15) | ((value & 15) << 4);
  else if (value === 0xae || value === 0xaf) state.enabled = value === 0xaf;
  else if (value === 0xa6 || value === 0xa7) state.inverted = value === 0xa7;
}
export function oledByte(state: OledState, value: number, controller: OledDevice['controller']): void {
  if (state.expectsControl) { state.control = value; state.expectsControl = false; return; }
  if (state.control! & 0x40) {
    if (state.column < 132) state.ram[state.page * 132 + state.column] = value;
    if (controller === 'sh1106' || state.mode === 2) state.column = (state.column + 1) % (controller === 'sh1106' ? 132 : 128);
    else if (state.mode === 0) { if (++state.column > state.columnEnd) { state.column = state.columnStart; state.page = state.page < state.pageEnd ? state.page + 1 : state.pageStart; } }
    else { if (++state.page > state.pageEnd) { state.page = state.pageStart; state.column = state.column < state.columnEnd ? state.column + 1 : state.columnStart; } }
  } else command(state, value);
  if (state.control! & 0x80) state.expectsControl = true;
}
export function oledPowered(device: OledDevice, voltages: Record<string, number>): boolean {
  const supply = (voltages[device.pins.vcc] ?? 0) - (voltages[device.pins.gnd] ?? 0);
  return supply >= 3.0 && supply <= 5.5;
}
export function connectedOled(circuit: Circuit, master: DigitalDevice, address: number, voltages: Record<string, number>): OledDevice | undefined {
  const found = (circuit.oleds ?? []).filter(oled => oled.address === address && oledPowered(oled, voltages)
    && oled.pins.sda === master.pins.pin23 && oled.pins.scl === master.pins.pin24 && oled.pins.gnd === master.pins.pin4
    && oled.pins.sda !== oled.pins.scl && oled.pins.sda !== oled.pins.gnd && oled.pins.scl !== oled.pins.gnd
    && oled.pins.sda !== oled.pins.vcc && oled.pins.scl !== oled.pins.vcc
    && (voltages[oled.pins.sda] ?? 0) - (voltages[oled.pins.gnd] ?? 0) >= 2
    && (voltages[oled.pins.scl] ?? 0) - (voltages[oled.pins.gnd] ?? 0) >= 2);
  return found.length === 1 ? found[0] : undefined;
}
export function oledTransaction(circuit: Circuit, digital: DigitalState, master: DigitalDevice, address: number, bytes: readonly number[], voltages: Record<string, number>): boolean {
  const device = connectedOled(circuit, master, address, voltages);
  if (!device) return false;
  digital.oleds ??= {};
  const state = digital.oleds[device.id] ??= createOledState();
  state.expectsControl = true;
  for (const byte of bytes) oledByte(state, byte, device.controller);
  return true;
}
export function oledDisplays(circuit: Circuit, digital: DigitalState, voltages: Record<string, number>): SimulationResult['oledDisplays'] {
  return Object.fromEntries((circuit.oleds ?? []).map(device => {
    digital.oleds ??= {};
    if (!oledPowered(device, voltages)) digital.oleds[device.id] = createOledState();
    const state = digital.oleds[device.id];
    const powered = oledPowered(device, voltages) && Boolean(state?.enabled);
    const pixels = new Uint8Array(1024);
    if (powered) for (let page = 0; page < 8; page++) for (let x = 0; x < 128; x++) pixels[page * 128 + x] = state.ram[page * 132 + x + (device.controller === 'sh1106' ? 2 : 0)] ^ (state.inverted ? 255 : 0);
    return [device.id, { pixels, powered }];
  }));
}
