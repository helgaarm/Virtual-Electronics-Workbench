import { describe, expect, it } from 'vitest';
import { advanceSimulationClock, createSimulationClock } from '../../src/simulation/clock';

describe('shared simulation clock', () => {
  it('converts elapsed wall time to fixed electrical steps using speed', () => {
    const clock = createSimulationClock({ timeStepSeconds: 0.005, speed: 2 }, 'running');
    expect(advanceSimulationClock(0.05, clock).stepCount).toBe(20);
  });

  it('does not advance while paused and caps catch-up work', () => {
    const paused = createSimulationClock({ timeStepSeconds: 0.001, speed: 1 });
    expect(advanceSimulationClock(1, paused).stepCount).toBe(0);
    const capped = advanceSimulationClock(10, { ...paused, status: 'running' }, 50);
    expect(capped.stepCount).toBe(50);
    expect(capped.clock.accumulatedSeconds).toBeLessThan(capped.clock.timeStepSeconds);
  });

  it('accumulates wall time without rounding partial electrical steps up', () => {
    let clock = createSimulationClock({ timeStepSeconds: 0.1, speed: 1 }, 'running');
    let advance = advanceSimulationClock(0.04, clock);
    expect(advance.stepCount).toBe(0);
    clock = advance.clock;
    advance = advanceSimulationClock(0.04, clock);
    expect(advance.stepCount).toBe(0);
    clock = advance.clock;
    advance = advanceSimulationClock(0.04, clock);
    expect(advance.stepCount).toBe(1);
    expect(advance.clock.accumulatedSeconds).toBeCloseTo(0.02, 9);
  });
});
