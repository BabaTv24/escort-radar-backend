import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapMouseEvent, Marker as MapLibreMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n';

type WorkPointMapProps = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  onChange: (point: { latitude: number; longitude: number }) => void;
};

const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/dark';
const fallbackStyle = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#11100e' } }]
};

export function WorkPointMap({ latitude, longitude, onChange }: WorkPointMapProps) {
  const { t } = useI18n();
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState('');
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!mapNode.current) return;
    let active = true;
    let map: MapLibreMap | null = null;
    let marker: MapLibreMarker | null = null;
    const start = toPoint(latitude, longitude) || { lat: 52.52, lng: 13.405 };
    void import('maplibre-gl').then((maplibregl) => {
      if (!active || !mapNode.current) return;
      map = new maplibregl.Map({
        container: mapNode.current,
        style: openFreeMapStyle,
        center: [start.lng, start.lat],
        zoom: toPoint(latitude, longitude) ? 15 : 11,
        attributionControl: false
      });
      marker = new maplibregl.Marker({ draggable: true })
        .setLngLat([start.lng, start.lat])
        .addTo(map);
      const setPoint = (lng: number, lat: number) => {
        if (!marker) return;
        const point = {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6))
        };
        marker.setLngLat([point.longitude, point.latitude]);
        onChangeRef.current(point);
      };
      map.on('click', (event: MapMouseEvent) => setPoint(event.lngLat.lng, event.lngLat.lat));
      marker.on('dragend', () => {
        if (!marker) return;
        const point = marker.getLngLat();
        setPoint(point.lng, point.lat);
      });
      map.on('error', () => {
        if (!active || !map) return;
        setError(t('location.mapLoadFailed'));
        if (!map.isStyleLoaded()) map.setStyle(fallbackStyle);
      });
      mapRef.current = map;
      markerRef.current = marker;
    }).catch(() => {
      if (active) setError(t('location.mapLoadFailed'));
    });
    return () => {
      active = false;
      marker?.remove();
      map?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const point = toPoint(latitude, longitude);
    if (!point || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([point.lng, point.lat]);
    mapRef.current.setCenter([point.lng, point.lat]);
  }, [latitude, longitude]);

  return (
    <div className="work-point-map">
      <strong>{t('location.workPointMap')}</strong>
      <p className="muted">{t('location.clickMapToSet')}</p>
      {error ? <p className="muted">{error}</p> : null}
      <div ref={mapNode} className="work-point-map-canvas" />
    </div>
  );
}

function toPoint(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
