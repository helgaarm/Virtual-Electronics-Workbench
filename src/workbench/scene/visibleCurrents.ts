import type { SimulationResult } from '../../domain/circuit/types';
import type { PlacedComponent } from '../../domain/components/types';

/** Match the renderer's current resolution without reconciling an unchanged scene. */
export function sameVisibleComponentCurrents(components: readonly PlacedComponent[], previous: SimulationResult, next: SimulationResult): boolean {
  if (previous.status !== next.status) return false;
  const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
  const bucket = (result: SimulationResult, id: string, display: boolean) => Math.round(
    (display ? (result.displayCurrentsA?.[id] ?? result.componentCurrents[id] ?? 0) : (result.componentCurrents[id] ?? 0)) * (display ? 100_000 : 4_000),
  );
  return components.every((part) => {
    if (part.kind === 'oled-i2c') {
      const before = previous.oledDisplays?.[part.id]; const after = next.oledDisplays?.[part.id];
      if (before?.powered !== after?.powered) return false;
      if (before?.pixels === after?.pixels) return true;
      return Boolean(before && after && before.pixels.length === after.pixels.length
        && before.pixels.every((byte, index) => byte === after.pixels[index]));
    }
    if (part.kind === 'led') return bucket(previous, part.id, false) === bucket(next, part.id, false);
    if (part.kind === 'arduino-nano') return bucket(previous, `${part.id}:led`, false) === bucket(next, `${part.id}:led`, false);
    const prefixes = part.kind === 'seven-segment' ? [part.id]
      : part.kind === 'four-digit-seven-segment' ? [1, 2, 3, 4].map((digit) => `${part.id}:digit${digit}`) : [];
    return prefixes.every((prefix) => segments.every((segment) => bucket(previous, `${prefix}:${segment}`, true) === bucket(next, `${prefix}:${segment}`, true)));
  });
}
