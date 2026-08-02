import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Map as MapLibreMap, MapMouseEvent, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n';

type WorkPointMapProps = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  onChange?: (point: { latitude: number; longitude: number }) => void;
  readOnly?: boolean;
  title?: string;
  description?: string;
};

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const EMPTY_MAP_CENTER = { lat: 50.1109, lng: 10.4515 };
maplibregl.setWorkerUrl(mapLibreWorkerUrl);

export function WorkPointMap({
  latitude,
  longitude,
  onChange,
  readOnly = false,
  title,
  description
}: WorkPointMapProps) {
  const { t } = useI18n();
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const pointRef = useRef(toPoint(latitude, longitude));
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  onChangeRef.current = onChange;
  pointRef.current = toPoint(latitude, longitude);

  useEffect(() => {
    if (!mapNode.current) return;
    let active = true;
    let map: MapLibreMap | null = null;
    let marker: MapLibreMarker | null = null;
    let observer: ResizeObserver | null = null;
    let loadTimeout: number | null = null;
    const resize = () => {
      if (!map || !mapNode.current || mapNode.current.clientWidth < 10 || mapNode.current.clientHeight < 10) return;
      map.resize();
    };
    const initialize = async () => {
      try {
        setError('');
        const response = await fetch(OPEN_FREE_MAP_STYLE, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Map style HTTP ${response.status}`);
        const style = await response.json() as StyleSpecification;
        if (!active || !mapNode.current) return;
        const initialPoint = pointRef.current;
        const start = initialPoint || EMPTY_MAP_CENTER;
        map = new maplibregl.Map({
          container: mapNode.current,
          style,
          center: [start.lng, start.lat],
          zoom: initialPoint ? 15 : 4,
          minZoom: 2,
          maxZoom: 22,
          attributionControl: false
        });
        mapRef.current = map;
        map.addControl(new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
        }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        marker = new maplibregl.Marker({ draggable: !readOnly })
          .setLngLat([start.lng, start.lat])
          .addTo(map);
        marker.getElement().hidden = !initialPoint;
        markerRef.current = marker;

        const setPoint = (lng: number, lat: number) => {
          if (!marker || readOnly || !onChangeRef.current) return;
          const point = {
            latitude: lat,
            longitude: lng
          };
          marker.setLngLat([point.longitude, point.latitude]);
          onChangeRef.current(point);
        };
        if (!readOnly) {
          map.on('click', (event: MapMouseEvent) => setPoint(event.lngLat.lng, event.lngLat.lat));
          marker.on('dragend', () => {
            const point = marker?.getLngLat();
            if (point) setPoint(point.lng, point.lat);
          });
        }
        map.on('load', () => {
          if (!active) return;
          if (loadTimeout) window.clearTimeout(loadTimeout);
          setError('');
          window.requestAnimationFrame(resize);
        });
        map.on('error', (event) => {
          if (!active) return;
          const message = String(event.error?.message || '');
          if (!map?.loaded() || /style|source|tile|glyph|sprite/i.test(message)) {
            setError(t('location.mapLoadFailed'));
          }
        });
        map.on('idle', () => {
          if (map?.areTilesLoaded()) setError('');
        });
        observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        observer?.observe(mapNode.current);
        window.addEventListener('resize', resize);
        loadTimeout = window.setTimeout(() => {
          if (!map?.loaded() || !map.areTilesLoaded()) setError(t('location.mapLoadFailed'));
        }, 15_000);
        window.requestAnimationFrame(resize);
      } catch {
        if (active) setError(t('location.mapLoadFailed'));
      }
    };
    void initialize();

    return () => {
      active = false;
      if (loadTimeout) window.clearTimeout(loadTimeout);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      marker?.remove();
      map?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [reloadKey, readOnly]);

  useEffect(() => {
    const point = toPoint(latitude, longitude);
    if (!mapRef.current || !markerRef.current) return;
    const next = point || EMPTY_MAP_CENTER;
    markerRef.current.getElement().hidden = !point;
    markerRef.current.setLngLat([next.lng, next.lat]);
    mapRef.current.setCenter([next.lng, next.lat]);
    mapRef.current.setZoom(point ? 15 : 4);
    window.requestAnimationFrame(() => mapRef.current?.resize());
  }, [latitude, longitude]);

  return (
    <div className="work-point-map" data-map-provider="openfreemap">
      <strong>{title || t('location.workPointMap')}</strong>
      <p className="muted">{description || (readOnly ? t('profile.exactLocation') : t('location.clickMapToSet'))}</p>
      <div className="work-point-map-shell">
        <div ref={mapNode} className="work-point-map-canvas" />
        {error ? (
          <div className="work-point-map-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>{t('states.retry')}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function toPoint(latitude: unknown, longitude: unknown) {
  if (latitude === null || latitude === undefined || latitude === '' || longitude === null || longitude === undefined || longitude === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
