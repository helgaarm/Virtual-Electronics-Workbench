export type SimulationClockStatus = 'running' | 'paused';

export interface SimulationClockSettings {
  timeStepSeconds: number;
  speed: number;
}

export interface SimulationClock {
  timeSeconds: number;
  timeStepSeconds: number;
  speed: number;
  status: SimulationClockStatus;
  accumulatedSeconds: number;
}

export interface SimulationClockAdvance {
  clock: SimulationClock;
  stepCount: number;
}

export function createSimulationClock(
  settings: SimulationClockSettings,
  status: SimulationClockStatus = 'paused',
): SimulationClock {
  return {
    timeSeconds: 0,
    timeStepSeconds: settings.timeStepSeconds,
    speed: settings.speed,
    status,
    accumulatedSeconds: 0,
  };
}

export function advanceSimulationClock(
  elapsedRealSeconds: number,
  clock: SimulationClock,
  maximum = 200,
): SimulationClockAdvance {
  if (clock.status !== 'running' || !Number.isFinite(elapsedRealSeconds) || elapsedRealSeconds <= 0) {
    return { clock, stepCount: 0 };
  }
  const accumulatedSeconds = clock.accumulatedSeconds + elapsedRealSeconds * clock.speed;
  const requested = Math.floor((accumulatedSeconds + Number.EPSILON) / clock.timeStepSeconds);
  const stepCount = Math.min(Math.max(0, Math.floor(maximum)), requested);
  const remainder = requested > stepCount
    ? accumulatedSeconds % clock.timeStepSeconds
    : accumulatedSeconds - stepCount * clock.timeStepSeconds;
  return {
    clock: { ...clock, accumulatedSeconds: Math.max(0, remainder) },
    stepCount,
  };
}
