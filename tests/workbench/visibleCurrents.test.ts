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
