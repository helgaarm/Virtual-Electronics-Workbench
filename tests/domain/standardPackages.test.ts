import { describe, expect, it } from 'vitest';
import { DIP_8_PACKAGE, DIP_14_PACKAGE, DIP_16_PACKAGE, dipPinPositionsMm } from '../../src/domain/physical/dipPackages';
import { TO_92_PACKAGE } from '../../src/domain/physical/to92Package';

describe('standard breadboard packages', () => {
  it.each([DIP_8_PACKAGE, DIP_14_PACKAGE, DIP_16_PACKAGE])('keeps $id on a 2.54 mm pitch with clockwise numbering', (definition) => {
    const pins = dipPinPositionsMm(definition);
    expect(definition.pinPitchMm).toBe(2.54);
    expect(definition.rowSpacingMm).toBe(7.62);
    expect(pins).toHaveLength(definition.pinCount);
    expect(pins[1].x - pins[0].x).toBeCloseTo(2.54);
    expect(pins.at(-1)?.x).toBe(0);
    expect(pins.at(-1)?.z).toBe(3.81);
  });

  it('keeps TO-92 package geometry independent of device pin semantics', () => {
    expect(TO_92_PACKAGE.bodyDimensionsMm).toEqual({ width: 4.8, height: 5.2, depth: 3.8 });
    expect(TO_92_PACKAGE.pinPositionsMm.map((pin) => pin.x)).toEqual([-2.54, 0, 2.54]);
    expect(TO_92_PACKAGE).not.toHaveProperty('collector');
  });
});
