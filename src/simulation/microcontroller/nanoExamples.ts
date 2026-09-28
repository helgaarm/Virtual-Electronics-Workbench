import type { DigitalDevice, DigitalState } from '../../domain/circuit/digital';

/** Behavioural equivalents of the included sketches; no code evaluation or hidden wall clock. */
export function sampleNanoExample(device: DigitalDevice, state: DigitalState['nanos'][string], timeSeconds: number, readPin: (pin: number) => number): void {
  const groundV = readPin(4);
  const supplyV = readPin(27) - groundV;
  const active = supplyV >= 4.5 && supplyV <= 5.5 && readPin(3) - groundV >= supplyV * 0.6;
  if (!active || !state.powered) state.startedAtSeconds = timeSeconds;
  state.powered = active;
  if (!active) state.outputHigh = false;
  else if (state.programId === 'blink') state.outputHigh = Math.floor(timeSeconds - state.startedAtSeconds + 1e-9) % 2 === 0;
  else if (state.programId === 'button-led') state.outputHigh = readPin(5) - groundV <= supplyV * 0.3;
  else {
    const adc = Math.max(0, Math.min(1023, Math.floor((readPin(19) - groundV) / supplyV * 1024)));
    state.outputHigh = adc >= 512;
  }
  // Poll reset/supply and inputs at 1 ms; Blink can sleep until its next edge.
  state.nextTimeSeconds = active && device.programId === 'blink'
    ? state.startedAtSeconds + Math.floor(timeSeconds - state.startedAtSeconds + 1e-9) + 1
    : timeSeconds + 0.001;
}
