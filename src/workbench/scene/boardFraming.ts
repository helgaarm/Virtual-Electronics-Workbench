/** Fit the board in a perspective top view, allowing space for raised parts. */
export function topViewDistanceMm(widthMm: number, depthMm: number, verticalFovDegrees: number, aspect: number): number {
  const halfAngleRadians = verticalFovDegrees * Math.PI / 360;
  const halfViewHeightMm = Math.max(depthMm / 2, widthMm / (2 * Math.max(aspect, 0.1)));
  return 20 + 1.12 * halfViewHeightMm / Math.tan(halfAngleRadians);
}

/** Fit all corners, including raised cables, to the camera's actual perspective. */
export function workbenchCameraPose(
  footprint: { widthMm: number; depthMm: number; centerXmm: number; centerZmm: number },
  preset: '3d' | 'top', verticalFovDegrees: number, aspect: number,
) {
  const { widthMm, depthMm, centerXmm, centerZmm } = footprint;
  const offset = preset === 'top' ? [0, 1, 0.0001] : [widthMm * 0.68, 70, depthMm * 0.9];
  const length = Math.hypot(...offset);
  const direction = offset.map(value => value / length);
  const horizontalLength = Math.hypot(direction[0], direction[2]);
  const right = [direction[2] / horizontalLength, 0, -direction[0] / horizontalLength];
  const up = [direction[1] * right[2], direction[2] * right[0] - direction[0] * right[2], -direction[1] * right[0]];
  const tangentY = Math.tan(verticalFovDegrees * Math.PI / 360);
  const tangentX = tangentY * Math.max(aspect, 0.1);
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  let distanceMm = 60;
  for (const x of [-widthMm / 2, widthMm / 2]) for (const y of [-4, 24]) for (const z of [-depthMm / 2, depthMm / 2]) {
    const corner = [x, y, z];
    distanceMm = Math.max(distanceMm, dot(corner, direction)
      + 1.12 * Math.max(Math.abs(dot(corner, right)) / tangentX, Math.abs(dot(corner, up)) / tangentY));
  }
  return {
    positionMm: { x: centerXmm + direction[0] * distanceMm, y: direction[1] * distanceMm, z: centerZmm + direction[2] * distanceMm },
    targetMm: { x: centerXmm, y: 0, z: centerZmm },
    distanceMm,
  };
}
