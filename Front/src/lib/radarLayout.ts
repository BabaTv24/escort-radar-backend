export type RadarPoint = { left: number; top: number };

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
