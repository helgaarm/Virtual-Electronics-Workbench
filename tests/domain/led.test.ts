import { describe, expect, it } from 'vitest';
import { recolorLed } from '../../src/domain/components/led';
import {
  LED_COLORS,
  LED_TYPICAL_FORWARD_VOLTAGE_V,
  type LedComponent,
} from '../../src/domain/components/types';

const led: LedComponent = {
  id: 'D1',
  kind: 'led',
  label: 'D1',
  rotation: 0,
  color: 'red',
  forwardVoltageV: 1.9,
  onResistanceOhms: 12,
  terminalHoleIds: { anode: 'main:A1', cathode: 'main:A2' },
};

describe('LED color selection', () => {
  it.each(LED_COLORS)('applies %s appearance and its typical forward voltage', (color) => {
    const recolored = recolorLed(led, color);
    expect(recolored.color).toBe(color);
    expect(recolored.forwardVoltageV).toBe(LED_TYPICAL_FORWARD_VOLTAGE_V[color]);
    expect(recolored.terminalHoleIds).toEqual(led.terminalHoleIds);
  });

  it('does not mutate the selected component', () => {
    recolorLed(led, 'blue');
    expect(led).toMatchObject({ color: 'red', forwardVoltageV: 1.9 });
  });
});
