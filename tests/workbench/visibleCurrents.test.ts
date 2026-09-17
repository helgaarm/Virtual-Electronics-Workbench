import { expect, it } from 'vitest';
import type { SimulationResult } from '../../src/domain/circuit/types';
import type { PlacedComponent } from '../../src/domain/components/types';
import { sameVisibleComponentCurrents } from '../../src/workbench/scene/visibleCurrents';

const display: PlacedComponent = { id: 'D', label: 'Display', kind: 'four-digit-seven-segment', rotation: 0,
  packageId: '12-pin-multiplexed', commonType: 'common-cathode', terminalHoleIds: {
    a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', dp: 'dp',
    digit1: 'digit1', digit2: 'digit2', digit3: 'digit3', digit4: 'digit4',
  } };
const result: SimulationResult = { status: 'ok', nodeVoltages: {}, componentCurrents: {}, componentPowers: {}, warnings: [], errors: [], iterations: 1 };

it('redraws when a multiplexed segment changes even if ordinary LED currents do not', () => {
  const lit = { ...result, displayCurrentsA: { 'D:digit2:a': 0.001 } };
  expect(sameVisibleComponentCurrents([display], result, lit)).toBe(false);
  expect(sameVisibleComponentCurrents([display], lit, { ...lit })).toBe(true);
  expect(sameVisibleComponentCurrents([display], lit, result)).toBe(false);
  expect(sameVisibleComponentCurrents([display], lit, { ...lit, status: 'error' })).toBe(false);
});

it('redraws changing OLED pixels and power while avoiding redraws for identical cloned frames', () => {
  const oled: PlacedComponent = { id: 'OLED1', label: 'OLED', kind: 'oled-i2c', controller: 'sh1106', address: 60, rotation: 0,
    terminalHoleIds: { gnd: 'a', vcc: 'b', scl: 'c', sda: 'd' } };
  const a = { ...result, oledDisplays: { OLED1: { powered: true, pixels: new Uint8Array(1024) } } };
  const b = structuredClone(a); b.oledDisplays.OLED1.pixels[200] = 32;
  expect(sameVisibleComponentCurrents([oled], a, b)).toBe(false);
  expect(sameVisibleComponentCurrents([oled], b, structuredClone(b))).toBe(true);
  const off = structuredClone(b); off.oledDisplays.OLED1.powered = false;
  expect(sameVisibleComponentCurrents([oled], b, off)).toBe(false);
  expect(sameVisibleComponentCurrents([oled], b, result)).toBe(false);
});
