export const RADAR_SWEEP_TOLERANCE_DEGREES = 9;

export type RadarScreenPoint = { x: number; y: number };

export function normalizeRadarAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

export function radarAngularDistance(left: number, right: number) {
  const distance = Math.abs(normalizeRadarAngle(left) - normalizeRadarAngle(right));
  return Math.min(distance, 360 - distance);
}

export function radarMarkerAngle(center: RadarScreenPoint, marker: RadarScreenPoint) {
  return normalizeRadarAngle(Math.atan2(marker.x - center.x, center.y - marker.y) * 180 / Math.PI);
}

export function isMarkerHitByRadarSweep(
  sweepAngle: number,
  markerAngle: number,
  tolerance = RADAR_SWEEP_TOLERANCE_DEGREES
) {
  return radarAngularDistance(sweepAngle, markerAngle) <= tolerance;
}

export function cssRotationAngle(transform: string) {
  if (!transform || transform === 'none') return 0;
  const values = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
  if (!values || values.length < 2 || values.some((value) => !Number.isFinite(value))) return 0;
  return normalizeRadarAngle(Math.atan2(values[1], values[0]) * 180 / Math.PI);
}
