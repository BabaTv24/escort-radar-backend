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
  const earthRadiusMeters = 6_371_000;
  const angularDistance = Math.max(radiusMeters, 1) / earthRadiusMeters;
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
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeScale = Math.max(Math.cos(center.lat * Math.PI / 180), 0.01);
  const longitudeDelta = radiusMeters / (111_320 * longitudeScale);
  return [
    [center.lng - longitudeDelta, center.lat - latitudeDelta],
    [center.lng + longitudeDelta, center.lat + latitudeDelta]
  ] as [[number, number], [number, number]];
}
