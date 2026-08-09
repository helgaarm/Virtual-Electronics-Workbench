import { describe, expect, it } from 'vitest';
import { CircularBuffer } from '../../src/state/CircularBuffer';

describe('CircularBuffer', () => {
  it('keeps insertion order while overwriting its oldest values', () => {
    const buffer = new CircularBuffer<number>(3, [1, 2]);
    buffer.pushMany([3, 4]);
    expect(buffer.toArray()).toEqual([2, 3, 4]);
  });

  it('can replace an existing capture without reallocating the buffer', () => {
    const buffer = new CircularBuffer<number>(3, [1, 2, 3]);
    buffer.replace([4, 5]);
    expect(buffer.toArray()).toEqual([4, 5]);
  });
});
