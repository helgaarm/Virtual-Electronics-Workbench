import { describe, expect, it } from 'vitest';
import type { OledComponent } from '../../src/domain/components/types';
import { createBreadboardDefinition, terminalHoleId } from '../../src/domain/physical/breadboard';
import { OLED_PACKAGE, OLED_TERMINALS, oledMounting } from '../../src/domain/physical/oled';
import { PHYSICAL_PACKAGES, packageCenterOffsetZMm } from '../../src/domain/physical/packages';

describe('OLED breadboard mounting', () => {
  const board = createBreadboardDefinition('mounting', 63);
  it.each([0, 180] as const)('seats the header, pins and support feet at %i degrees', rotation => {
    const component: OledComponent = { id: 'OLED1', kind: 'oled-i2c', label: 'OLED', controller: 'sh1106', address: 60, rotation,
      terminalHoleIds: Object.fromEntries(OLED_TERMINALS.map((terminal, i) => [terminal, terminalHoleId(board.id, rotation ? 'J' : 'A', rotation ? 57 - i : 54 + i)])) as OledComponent['terminalHoleIds'] };
    const mounting = oledMounting(board, component)!;
    const bottomYmm = mounting.pcbCenterMm.y - OLED_PACKAGE.pcbThicknessMm / 2;
    expect(mounting.headerCenterMm.y - OLED_PACKAGE.headerHeightMm / 2).toBeCloseTo(board.heightMm / 2);
    expect(mounting.headerCenterMm.y + OLED_PACKAGE.headerHeightMm / 2).toBeCloseTo(bottomYmm);
    expect(mounting.pcbCenterMm.y - board.heightMm / 2).toBe(PHYSICAL_PACKAGES['oled-i2c'].mountingHeightMm);
    expect(mounting.pcbCenterMm.z - mounting.headerCenterMm.z).toBeCloseTo(packageCenterOffsetZMm(component.kind, rotation));
    for (const pin of mounting.pins) {
      const hole = board.holes.find(h => h.id === component.terminalHoleIds[pin.terminal])!;
      expect(pin.bottomMm.x).toBe(hole.positionMm.x); expect(pin.bottomMm.z).toBe(hole.positionMm.z);
      expect(pin.topMm.x).toBe(hole.positionMm.x); expect(pin.topMm.z).toBe(hole.positionMm.z);
      expect(pin.bottomMm.y).toBeLessThan(hole.positionMm.y);
      expect(pin.bottomMm.y).toBeGreaterThan(-board.heightMm / 2);
      expect(pin.topMm.y).toBeGreaterThan(mounting.pcbCenterMm.y + OLED_PACKAGE.pcbThicknessMm / 2);
    }
    expect(mounting.feet).toHaveLength(2);
    for (const foot of mounting.feet) {
      expect(foot.y - foot.heightMm / 2).toBeCloseTo(board.heightMm / 2);
      expect(foot.y + foot.heightMm / 2).toBeCloseTo(bottomYmm);
    }
  });
  it('does not fabricate leads for a missing hole', () => {
    const component: OledComponent = { id: 'OLED1', kind: 'oled-i2c', label: 'OLED', controller: 'sh1106', address: 60, rotation: 0,
      terminalHoleIds: { gnd: 'missing', vcc: 'missing', scl: 'missing', sda: 'missing' } };
    expect(oledMounting(board, component)).toBeUndefined();
  });
});
