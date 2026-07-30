import type { Profile } from '../types';
import { getCityCenter, isValidLatLng } from './geo';
import type { ProfileRadarLocation } from './geo';
import { getApproximateRadarDisplayLocation } from './radarLayout';

export const RADAR_CITY_ONLY_SPACING_METERS = 350;

type RadarCenter = { lat: number; lng: number };

export type RadarMapItem = {
  profile: Profile;
  distanceKm: number;
  operatorStatus: string;
  statusClass: string;
  filterCoordinates: ProfileRadarLocation;
  displayCoordinates: { lat: number; lng: number };
  isApproximateLocation: boolean;
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
        coordinates: [item.displayCoordinates.lng, item.displayCoordinates.lat]
      },
      properties: {
        id: item.profile.id,
        operatorStatus: item.operatorStatus,
        statusClass: item.statusClass,
        favorite: item.favorite,
        approximate: item.isApproximateLocation
      } satisfies RadarProfileFeatureProperties
    }))
  };
}

export function assignRadarDisplayCoordinates(items: RadarMapItem[], layoutUniverse: RadarMapItem[] = items) {
  const displayCoordinatesById = new Map<string, { lat: number; lng: number }>();
  const approximateGroups = new Map<string, RadarMapItem[]>();

  for (const item of layoutUniverse) {
    if (!item.isApproximateLocation) {
      displayCoordinatesById.set(item.profile.id, {
        lat: item.filterCoordinates.lat,
        lng: item.filterCoordinates.lng
      });
      continue;
    }
    const city = String(item.profile.work_city || item.profile.city || '').trim();
    const cityCenter = getCityCenter(city);
    const center = isValidLatLng(cityCenter.lat, cityCenter.lng)
      ? cityCenter
      : item.filterCoordinates;
    const country = String(item.profile.work_country || '').trim().toLowerCase();
    const groupKey = `${country}|${city.toLowerCase()}|${center.lat},${center.lng}`;
    const group = approximateGroups.get(groupKey) || [];
    group.push(item);
    approximateGroups.set(groupKey, group);
  }

  for (const group of approximateGroups.values()) {
    group.sort((left, right) => {
      const leftKey = `${left.profile.work_city || left.profile.city || ''}|${left.profile.id}`;
      const rightKey = `${right.profile.work_city || right.profile.city || ''}|${right.profile.id}`;
      return leftKey.localeCompare(rightKey);
    });
    const city = String(group[0].profile.work_city || group[0].profile.city || '').trim();
    const resolvedCenter = getCityCenter(city);
    const center = isValidLatLng(resolvedCenter.lat, resolvedCenter.lng)
      ? resolvedCenter
      : group[0].filterCoordinates;
    group.forEach((item, index) => {
      displayCoordinatesById.set(item.profile.id, getApproximateRadarDisplayLocation(center, index));
    });
  }

  return items.map((item) => ({
    ...item,
    displayCoordinates: displayCoordinatesById.get(item.profile.id) || item.displayCoordinates
  }));
}

export function buildRadarCenterFeatureCollection(center: RadarCenter) {
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

export function buildRadarRadiusFeatureCollection(center: RadarCenter, radiusMeters: number, steps = 96) {
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

export function getRadarRadiusBounds(center: RadarCenter, radiusMeters: number) {
  const coordinates = buildRadarRadiusFeatureCollection(center, radiusMeters).features[0].geometry.coordinates[0];
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)]
  ] as [[number, number], [number, number]];
}
