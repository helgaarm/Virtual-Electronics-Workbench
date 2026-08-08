import { describe, expect, it } from 'vitest';
import type { ComponentKind } from '../../src/domain/components/types';
import { leadSpanViolation, PHYSICAL_PACKAGES } from '../../src/domain/physical/packages';

describe('physical package lead spans', () => {
  it.each([
    'voltage-source',
    'resistor',
    'led',
    'switch',
  ] as ComponentKind[])('enforces realistic minimum and maximum spans for %s', (kind) => {
    const limits = PHYSICAL_PACKAGES[kind].leadSpanMm!;

    expect(leadSpanViolation(kind, limits.minimum - 0.1)).toBe('too-short');
    expect(leadSpanViolation(kind, limits.minimum)).toBeUndefined();
    expect(leadSpanViolation(kind, limits.maximum)).toBeUndefined();
    expect(leadSpanViolation(kind, limits.maximum + 0.1)).toBe('too-long');
  });

  it('keeps jumper wires flexible and ground posts single-terminal', () => {
    expect(PHYSICAL_PACKAGES['jumper-wire'].leadSpanMm).toBeUndefined();
    expect(PHYSICAL_PACKAGES.ground.leadSpanMm).toBeUndefined();
    expect(leadSpanViolation('jumper-wire', 100)).toBeUndefined();
  });
});
