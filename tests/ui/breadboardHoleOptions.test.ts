import { describe, expect, it } from 'vitest';
import { createBreadboardDefinition } from '../../src/domain/physical/breadboard';
import { breadboardHoleOptionGroups } from '../../src/ui/breadboardHoleOptions';

describe('breadboard hole selector ordering', () => {
  it('groups holes by physical rail or terminal row and sorts each group numerically', () => {
    const groups = breadboardHoleOptionGroups(createBreadboardDefinition('main', 30));
    expect(groups.map((group) => group.label)).toEqual([
      'Top positive rail (+)',
      'Top negative rail (−)',
      'Terminal row A',
      'Terminal row B',
      'Terminal row C',
      'Terminal row D',
      'Terminal row E',
      'Terminal row F',
      'Terminal row G',
      'Terminal row H',
      'Terminal row I',
      'Terminal row J',
      'Bottom negative rail (−)',
      'Bottom positive rail (+)',
    ]);
    expect(groups[0].holes.map((hole) => hole.label)).toEqual(
      Array.from({ length: 30 }, (_, index) => `T+${index + 1}`),
    );
    expect(groups[3].holes.map((hole) => hole.label)).toEqual(
      Array.from({ length: 30 }, (_, index) => `B${index + 1}`),
    );
    expect(groups.at(-1)?.holes.map((hole) => hole.label)).toEqual(
      Array.from({ length: 30 }, (_, index) => `B+${index + 1}`),
    );
  });
});
