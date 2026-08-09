export function formatVoltage(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(Math.abs(value) < 10 ? 3 : 2)} V`;
}

export function formatCurrent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude < 1e-6) return `${(value * 1e9).toFixed(1)} nA`;
  if (magnitude < 1e-3) return `${(value * 1e6).toFixed(1)} µA`;
  return `${(value * 1e3).toFixed(2)} mA`;
}

export function formatPower(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude < 1e-6) return `${(value * 1e9).toFixed(1)} nW`;
  if (magnitude < 1e-3) return `${(value * 1e6).toFixed(1)} µW`;
  if (magnitude < 1) return `${(value * 1e3).toFixed(2)} mW`;
  return `${value.toFixed(2)} W`;
}

export function formatResistance(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MΩ`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 2)} kΩ`;
  return `${value} Ω`;
}

export function formatCapacitance(valueFarads: number): string {
  const magnitude = Math.abs(valueFarads);
  if (magnitude >= 1e-3) return `${(valueFarads * 1e3).toFixed(2)} mF`;
  if (magnitude >= 1e-6) return `${(valueFarads * 1e6).toFixed(2)} µF`;
  if (magnitude >= 1e-9) return `${(valueFarads * 1e9).toFixed(2)} nF`;
  return `${(valueFarads * 1e12).toFixed(2)} pF`;
}
