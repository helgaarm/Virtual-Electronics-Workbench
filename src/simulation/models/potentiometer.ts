export interface PotentiometerResistances {
  terminalAToWiperOhms: number;
  wiperToTerminalBOhms: number;
}

export function potentiometerResistances(
  totalResistanceOhms: number,
  wiperPosition: number,
  minimumSegmentResistanceOhms = 0.1,
): PotentiometerResistances {
  const total = Math.max(minimumSegmentResistanceOhms * 2, totalResistanceOhms);
  const fraction = Math.min(1, Math.max(0, wiperPosition));
  const terminalAToWiperOhms = Math.max(minimumSegmentResistanceOhms, total * fraction);
  const wiperToTerminalBOhms = Math.max(minimumSegmentResistanceOhms, total * (1 - fraction));
  return { terminalAToWiperOhms, wiperToTerminalBOhms };
}
