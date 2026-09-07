/** Fit the board in a perspective top view, allowing space for raised parts. */
export function topViewDistanceMm(widthMm: number, depthMm: number, verticalFovDegrees: number, aspect: number): number {
  const halfAngleRadians = verticalFovDegrees * Math.PI / 360;
  const halfViewHeightMm = Math.max(depthMm / 2, widthMm / (2 * Math.max(aspect, 0.1)));
  return 20 + 1.12 * halfViewHeightMm / Math.tan(halfAngleRadians);
}
