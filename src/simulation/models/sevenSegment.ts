export const SEVEN_SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
export type SevenSegmentId = (typeof SEVEN_SEGMENTS)[number];

export interface PersistenceOfVisionState {
  intensities: Record<SevenSegmentId, number>;
}

export function createPersistenceOfVisionState(): PersistenceOfVisionState {
  return { intensities: Object.fromEntries(SEVEN_SEGMENTS.map((segment) => [segment, 0])) as Record<SevenSegmentId, number> };
}

/** Exponential visual integration only; electrical currents remain instantaneous. */
export function integrateSegmentCurrents(
  state: PersistenceOfVisionState,
  currentsA: Readonly<Partial<Record<SevenSegmentId, number>>>,
  elapsedSeconds: number,
  persistenceSeconds = 0.04,
  nominalCurrentA = 0.01,
): PersistenceOfVisionState {
  const blend = 1 - Math.exp(-Math.max(0, elapsedSeconds) / persistenceSeconds);
  return {
    intensities: Object.fromEntries(SEVEN_SEGMENTS.map((segment) => {
      const target = Math.min(1, Math.max(0, (currentsA[segment] ?? 0) / nominalCurrentA));
      return [segment, state.intensities[segment] + (target - state.intensities[segment]) * blend];
    })) as Record<SevenSegmentId, number>,
  };
}
