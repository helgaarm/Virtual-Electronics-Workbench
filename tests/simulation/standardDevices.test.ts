import { describe, expect, it } from 'vitest';
import { detectContention, finiteDigitalOutput, logicLevelFromVoltage } from '../../src/simulation/mixedSignal';
import { create74hc595State, parallelOutputDrives, serialOutput, step74hc595 } from '../../src/simulation/models/shiftRegister74hc595';
import { potentiometerResistances } from '../../src/simulation/models/potentiometer';
import { createPersistenceOfVisionState, integrateSegmentCurrents } from '../../src/simulation/models/sevenSegment';
import { tmp36Output } from '../../src/simulation/models/tmp36';

describe('TMP36 nominal electrical transfer', () => {
  it.each([[-40, 0.1], [0, 0.5], [23.4, 0.734], [100, 1.5]])('maps %s °C to %s V', (temperatureC, expectedVoltageV) => {
    expect(tmp36Output(temperatureC, 5).outputVoltageV).toBeCloseTo(expectedVoltageV, 6);
  });
  it('reports an invalid supply rather than fabricating an output', () => {
    expect(tmp36Output(25, 2).validSupply).toBe(false);
    expect(tmp36Output(25, 2).outputVoltageV).toBe(0);
  });
});

describe('mixed signal bridge', () => {
  it('uses supply-relative HC input thresholds', () => {
    expect(logicLevelFromVoltage(1, 0, 5)).toBe('low');
    expect(logicLevelFromVoltage(2.5, 0, 5)).toBe('indeterminate');
    expect(logicLevelFromVoltage(4, 0, 5)).toBe('high');
  });
  it('surfaces opposing finite output drivers as contention', () => {
    expect(detectContention([finiteDigitalOutput('high', 0, 5), finiteDigitalOutput('low', 0, 5)])).toBe(true);
  });
});

describe('74HC595', () => {
  it('shifts on rising SRCLK, latches on rising RCLK, and tri-states on OE high', () => {
    let state = create74hc595State();
    const low = { data: 'high', shiftClock: 'low', latchClock: 'low', clear: 'high', outputEnable: 'low' } as const;
    state = step74hc595(state, low);
    state = step74hc595(state, { ...low, shiftClock: 'high' });
    expect(state.shiftBits[0]).toBe(true);
    expect(state.outputBits[0]).toBe(false);
    state = step74hc595(state, { ...low, latchClock: 'high' });
    expect(state.outputBits[0]).toBe(true);
    expect(parallelOutputDrives(state, 'low', 0, 5)[0].targetVoltageV).toBe(5);
    expect(parallelOutputDrives(state, 'high', 0, 5)[0].level).toBe('high-impedance');
  });
  it('provides QH-prime for a two-device cascade', () => {
    let first = create74hc595State();
    for (let index = 0; index < 8; index += 1) {
      const data = index === 0 ? 'high' : 'low';
      first = step74hc595(first, { data, shiftClock: 'low', latchClock: 'low', clear: 'high', outputEnable: 'low' });
      first = step74hc595(first, { data, shiftClock: 'high', latchClock: 'low', clear: 'high', outputEnable: 'low' });
    }
    expect(serialOutput(first)).toBe(true);
  });
});

it('models a potentiometer as two endpoint-safe resistors', () => {
  expect(potentiometerResistances(10_000, 0.25)).toEqual({ terminalAToWiperOhms: 2500, wiperToTerminalBOhms: 7500 });
  expect(potentiometerResistances(10_000, 0).terminalAToWiperOhms).toBeGreaterThan(0);
});

it('integrates display current visually and decays when current stops', () => {
  const lit = integrateSegmentCurrents(createPersistenceOfVisionState(), { a: 0.01 }, 0.04);
  const darkening = integrateSegmentCurrents(lit, {}, 0.2);
  expect(lit.intensities.a).toBeGreaterThan(0.6);
  expect(darkening.intensities.a).toBeLessThan(0.01);
});
