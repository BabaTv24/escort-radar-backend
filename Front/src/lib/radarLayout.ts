export function isVisuallyCompressed(radius: number, distanceKm: number, approximate: boolean) {
  return approximate && distanceKm * 1000 / Math.max(radius, 1) < 0.04;
}

export function getRadarPoint(radius: number, distanceKm: number, bearingDeg: number, profileId: string, approximate: boolean, spreadIndex?: number, spreadCount = 0) {
  const markerPaddingPercent = 11;
  const maxPixelRadius = 50 - markerPaddingPercent;
  const radialRatio = Math.min(Math.max(distanceKm * 1000 / Math.max(radius, 1), 0), 1);
  if (approximate && spreadIndex !== undefined && spreadCount > 1 && isVisuallyCompressed(radius, distanceKm, approximate)) {
    const goldenAngleDeg = 137.507764;
    const visualRatio = 0.14 + 0.64 * Math.sqrt((spreadIndex + 0.5) / spreadCount);
    const bearingRad = ((spreadIndex * goldenAngleDeg) % 360) * Math.PI / 180;
    return {
      left: 50 + Math.sin(bearingRad) * maxPixelRadius * visualRatio,
      top: 50 - Math.cos(bearingRad) * maxPixelRadius * visualRatio
    };
  }
  const deterministicAngle = stableProfileHash(profileId) % 360;
  const minVisibleRatio = approximate ? 0.06 + (stableProfileHash(`${profileId}:radius`) % 7) / 100 : distanceKm > 0 ? 0.08 : 0;
  const visualRatio = Math.max(radialRatio, minVisibleRatio);
  const bearingRad = (approximate && radialRatio < minVisibleRatio ? deterministicAngle : bearingDeg) * (Math.PI / 180);

  return {
    left: 50 + Math.sin(bearingRad) * maxPixelRadius * visualRatio,
    top: 50 - Math.cos(bearingRad) * maxPixelRadius * visualRatio
  };
}

function stableProfileHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
