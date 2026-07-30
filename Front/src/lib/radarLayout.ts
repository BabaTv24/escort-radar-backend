export type RadarPoint = { left: number; top: number };
export type GeographicPoint = { lat: number; lng: number };

export const APPROXIMATE_RADAR_LAYOUT_SPACING_METERS = 350;

export function getRadarPoint(radius: number, distanceKm: number, bearingDeg: number, _profileId?: string, _approximate?: boolean, _spreadIndex?: number, _spreadCount = 0): RadarPoint {
  const markerPaddingPercent = 11;
  const radarRadiusPercent = 50 - markerPaddingPercent;
  const normalizedRadius = Math.min(Math.max(distanceKm * 1000 / Math.max(radius, 1), 0), 1);
  const angle = (bearingDeg - 90) * Math.PI / 180;

  return {
    left: 50 + Math.cos(angle) * normalizedRadius * radarRadiusPercent,
    top: 50 + Math.sin(angle) * normalizedRadius * radarRadiusPercent
  };
}

export function clusterRadarPoints<T extends { point: RadarPoint }>(items: T[], collisionDistancePercent: number) {
  const clusters: Array<{ point: RadarPoint; items: T[] }> = [];

  for (const item of items) {
    const matchingIndexes = clusters
      .map((cluster, index) => cluster.items.some(({ point }) => (
        Math.hypot(item.point.left - point.left, item.point.top - point.top) <= collisionDistancePercent
      )) ? index : -1)
      .filter((index) => index >= 0);

    if (matchingIndexes.length === 0) {
      clusters.push({ point: item.point, items: [item] });
      continue;
    }

    const targetIndex = matchingIndexes[0];
    clusters[targetIndex].items.push(item);
    for (let index = matchingIndexes.length - 1; index > 0; index -= 1) {
      const sourceIndex = matchingIndexes[index];
      clusters[targetIndex].items.push(...clusters[sourceIndex].items);
      clusters.splice(sourceIndex, 1);
    }
  }

  return clusters;
}

export function getApproximateRadarDisplayLocation(
  center: GeographicPoint,
  index: number,
  spacingMeters = APPROXIMATE_RADAR_LAYOUT_SPACING_METERS
): GeographicPoint {
  const [q, r] = getHexSpiralCoordinates(index);
  const eastMeters = spacingMeters * (q + r / 2);
  const northMeters = spacingMeters * Math.sqrt(3) / 2 * r;
  const earthRadiusMeters = 6_371_000;
  const latitudeRadians = center.lat * Math.PI / 180;
  return {
    lat: center.lat + northMeters / earthRadiusMeters * 180 / Math.PI,
    lng: center.lng + eastMeters / (earthRadiusMeters * Math.cos(latitudeRadians)) * 180 / Math.PI
  };
}

function getHexSpiralCoordinates(rawIndex: number): [q: number, r: number] {
  let remaining = Math.max(0, Math.floor(rawIndex));
  if (remaining === 0) return [0, 0];
  remaining -= 1;

  let ring = 1;
  while (remaining >= ring * 6) {
    remaining -= ring * 6;
    ring += 1;
  }

  let q = ring;
  let r = 0;
  const directions: ReadonlyArray<readonly [number, number]> = [
    [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]
  ];
  for (const [deltaQ, deltaR] of directions) {
    const steps = Math.min(remaining, ring);
    q += deltaQ * steps;
    r += deltaR * steps;
    remaining -= steps;
    if (remaining === 0) break;
  }
  return [q, r];
}
