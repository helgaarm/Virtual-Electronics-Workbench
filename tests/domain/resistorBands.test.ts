import { describe, expect, it } from 'vitest';
import { resistorColorBands } from '../../src/domain/components/resistorBands';

describe('resistor color bands', () => {
  it.each([
    [0.1, ['brown', 'black', 'silver', 'gold']],
    [0.47, ['yellow', 'violet', 'silver', 'gold']],
    [1, ['brown', 'black', 'gold', 'gold']],
    [4.7, ['yellow', 'violet', 'gold', 'gold']],
    [220, ['red', 'red', 'brown', 'gold']],
    [1_000, ['brown', 'black', 'red', 'gold']],
    [10_000, ['brown', 'black', 'orange', 'gold']],
  ] as const)('calculates the four bands for %s ohms', (ohms, expected) => {
    expect(resistorColorBands(ohms, 5)).toEqual(expected);
  });

  it('rejects non-positive resistance', () => {
    expect(() => resistorColorBands(0)).toThrow(/positive/);
  });
});
