import type { Profile } from '../types';
import type { GeoPoint, ProfileRadarLocation } from './geo';

export const RADAR_CITY_ONLY_SPACING_METERS = 350;

export type RadarMapItem = {
  profile: Profile;
  distanceKm: number;
  operatorStatus: string;
  statusClass: string;
  radarLocation: ProfileRadarLocation;
  favorite: boolean;
};

export type RadarProfileFeatureProperties = {
  id: string;
  operatorStatus: string;
  statusClass: string;
  favorite: boolean;
  approximate: boolean;
};

export function buildRadarProfileFeatureCollection(items: RadarMapItem[]) {
  return {
    type: 'FeatureCollection' as const,
    features: items.map((item) => ({
      type: 'Feature' as const,
      id: item.profile.id,
      geometry: {
        type: 'Point' as const,
        // GeoJSON and MapLibre always use [longitude, latitude].
        coordinates: [item.radarLocation.lng, item.radarLocation.lat]
      },
      properties: {
        id: item.profile.id,
        operatorStatus: item.operatorStatus,
        statusClass: item.statusClass,
        favorite: item.favorite,
        approximate: item.radarLocation.approximate
      } satisfies RadarProfileFeatureProperties
    }))
  };
}

export function buildRadarCenterFeatureCollection(center: GeoPoint) {
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [center.lng, center.lat]
      },
      properties: {}
    }]
  };
}

export function buildRadarRadiusFeatureCollection(center: GeoPoint, radiusMeters: number, steps = 96) {
  const earthRadiusKilometers = 6_371;
  const radiusKilometers = Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters / 1_000 : 0;
  const angularDistance = radiusKilometers / earthRadiusKilometers;
  const centerLat = center.lat * Math.PI / 180;
  const centerLng = center.lng * Math.PI / 180;
  const coordinates: number[][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = index / steps * Math.PI * 2;
    const latitude = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance)
      + Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const longitude = centerLng + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
      Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(latitude)
    );
    coordinates.push([longitude * 180 / Math.PI, latitude * 180 / Math.PI]);
  }

  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coordinates]
      },
      properties: { radiusMeters }
    }]
  };
}

export function getRadarRadiusBounds(center: GeoPoint, radiusMeters: number) {
  const coordinates = buildRadarRadiusFeatureCollection(center, radiusMeters).features[0].geometry.coordinates[0];
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)]
  ] as [[number, number], [number, number]];
}
