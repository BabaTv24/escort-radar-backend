import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed } from 'lucide-react';
import { formatDistanceKm, isValidLatLng } from '../lib/geo';
import { getPublicLocationLabel } from '../lib/locationLabels';
import {
  buildRadarCenterFeatureCollection,
  buildRadarProfileFeatureCollection,
  buildRadarRadiusFeatureCollection,
  getRadarRadiusBounds
} from '../lib/radarMapData';
import type { RadarMapItem } from '../lib/radarMapData';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const PROFILE_SOURCE = 'radar-profiles';
const RADIUS_SOURCE = 'radar-radius';
const CENTER_SOURCE = 'radar-center';

maplibregl.setWorkerUrl(mapLibreWorkerUrl);

type RadarMapLibreProps = {
  searchCenter: readonly [longitude: number, latitude: number];
  radius: number;
  items: RadarMapItem[];
  empty: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function RadarMapLibre({ searchCenter, radius, items, empty, t }: RadarMapLibreProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itemsRef = useRef(items);
  const longitude = searchCenter[0];
  const latitude = searchCenter[1];
  const center = { lng: longitude, lat: latitude };
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  itemsRef.current = items;

  function recenter(animate = true) {
    const map = mapRef.current;
    if (!map || !isValidLatLng(center.lat, center.lng)) return;
    const container = map.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 100 || height < 100) return;
    const padding = getRadarRingPadding(container);
    map.fitBounds(getRadarRadiusBounds(center, radius), {
      padding,
      maxZoom: 22,
      duration: animate ? 500 : 0
    });
  }

  useEffect(() => {
    if (!containerRef.current || !isValidLatLng(center.lat, center.lng)) return;
    let active = true;
    let loaded = false;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | null = null;
    let tileTimeout: number | null = null;
    let initializationPoll: number | null = null;

    const loadTimeout = window.setTimeout(() => {
      if (!loaded) setMapError(true);
    }, 15_000);

    fetch(MAP_STYLE)
      .then((response) => {
        if (!response.ok) throw new Error(`Map style HTTP ${response.status}`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then((style) => {
        if (!active || !containerRef.current) return;
        map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: [center.lng, center.lat],
          zoom: 11,
          minZoom: 2,
          maxZoom: 22,
          scrollZoom: false,
          attributionControl: false
        });
        mapRef.current = map;
        map.addControl(new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
        }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        let radarInitialized = false;
        const initializeRadar = () => {
          if (!map || radarInitialized || !map.getStyle().layers?.length) return;
          try {
            addRadarSourcesAndLayers(map, center, radius, itemsRef.current);
          } catch {
            removeRadarSourcesAndLayers(map);
            return;
          }
          radarInitialized = true;
          loaded = true;
          window.clearTimeout(loadTimeout);
          bindRadarInteractions(map, itemsRef, t);
          setMapReady(true);
          setMapError(false);
          window.requestAnimationFrame(() => recenter(false));
          tileTimeout = window.setTimeout(() => {
            if (map && !map.areTilesLoaded()) setMapError(true);
          }, 15_000);
        };
        map.on('styledata', initializeRadar);
        map.on('load', initializeRadar);
        initializationPoll = window.setInterval(() => {
          initializeRadar();
          if (radarInitialized && initializationPoll) {
            window.clearInterval(initializationPoll);
            initializationPoll = null;
          }
        }, 50);
        map.on('error', () => {
          if (!loaded) setMapError(true);
        });
        map.on('idle', () => {
          if (map?.areTilesLoaded()) {
            if (tileTimeout) window.clearTimeout(tileTimeout);
            setMapError(false);
          }
        });
        observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
          map?.resize();
          if (radarInitialized) recenter(false);
        });
        observer?.observe(containerRef.current);
      })
      .catch(() => {
        if (active) setMapError(true);
      });

    return () => {
      active = false;
      window.clearTimeout(loadTimeout);
      if (tileTimeout) window.clearTimeout(tileTimeout);
      if (initializationPoll) window.clearInterval(initializationPoll);
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [reloadKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setSourceData(map, PROFILE_SOURCE, buildRadarProfileFeatureCollection(items));
  }, [items, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !isValidLatLng(center.lat, center.lng)) return;
    setSourceData(map, CENTER_SOURCE, buildRadarCenterFeatureCollection(center));
    setSourceData(map, RADIUS_SOURCE, buildRadarRadiusFeatureCollection(center, radius));
    recenter();
  }, [latitude, longitude, radius, mapReady]);

  return (
    <div
      className="radar-maplibre-shell"
      data-search-center={`${longitude},${latitude}`}
      data-radius-meters={radius}
    >
      <div ref={containerRef} className="radar-maplibre" aria-label={t('radar.title')} />
      <button className="radar-recenter" type="button" onClick={() => recenter()} aria-label={t('radar.recenter')}>
        <LocateFixed size={17} />
      </button>
      {empty && mapReady && (
        <div className="radar-empty-state">
          <strong>{t('radar.noProfilesInRadius')}</strong>
          <small>{t('radar.profilesWithoutRadarLocation')}</small>
        </div>
      )}
      {mapError && (
        <div className="radar-map-error" role="alert">
          <strong>{t('radar.mapLoadFailed')}</strong>
          <button type="button" onClick={() => {
            setMapError(false);
            setReloadKey((value) => value + 1);
          }}>{t('states.retry')}</button>
        </div>
      )}
    </div>
  );
}

function getRadarRingPadding(container: HTMLElement) {
  const mapRect = container.getBoundingClientRect();
  const radar = container.closest('.radar-map-surface')?.querySelector<HTMLElement>('.radar-visual-canvas');
  const radarRect = radar?.getBoundingClientRect();
  if (!radarRect || radarRect.width <= 0 || radarRect.height <= 0) {
    const diameter = Math.min(mapRect.width, mapRect.height) * .88;
    return {
      top: (mapRect.height - diameter) / 2,
      right: (mapRect.width - diameter) / 2,
      bottom: (mapRect.height - diameter) / 2,
      left: (mapRect.width - diameter) / 2
    };
  }

  // The selected outer ring is 88% of the stable visual radar diameter.
  const ringDiameter = Math.min(radarRect.width, radarRect.height) * .88;
  const ringRadius = ringDiameter / 2;
  const centerX = radarRect.left - mapRect.left + radarRect.width / 2;
  const centerY = radarRect.top - mapRect.top + radarRect.height / 2;
  return {
    top: Math.max(0, centerY - ringRadius),
    right: Math.max(0, mapRect.width - centerX - ringRadius),
    bottom: Math.max(0, mapRect.height - centerY - ringRadius),
    left: Math.max(0, centerX - ringRadius)
  };
}

function addRadarSourcesAndLayers(map: MapLibreMap, center: { lat: number; lng: number }, radius: number, items: RadarMapItem[]) {
  map.addSource(RADIUS_SOURCE, { type: 'geojson', data: buildRadarRadiusFeatureCollection(center, radius) });
  map.addLayer({
    id: 'radar-radius-fill',
    type: 'fill',
    source: RADIUS_SOURCE,
    paint: { 'fill-color': '#d9a84e', 'fill-opacity': 0.12 }
  });
  map.addLayer({
    id: 'radar-radius-line',
    type: 'line',
    source: RADIUS_SOURCE,
    paint: { 'line-color': '#f4d77f', 'line-opacity': 0.72, 'line-width': 1.5 }
  });

  map.addSource(PROFILE_SOURCE, {
    type: 'geojson',
    data: buildRadarProfileFeatureCollection(items),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 42
  });
  map.addLayer({
    id: 'radar-clusters',
    type: 'circle',
    source: PROFILE_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#7b4dff',
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 30, 27],
      'circle-stroke-color': '#fff0ba',
      'circle-stroke-width': 2
    }
  });
  map.addLayer({
    id: 'radar-cluster-count',
    type: 'symbol',
    source: PROFILE_SOURCE,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' }
  });
  map.addLayer({
    id: 'radar-profile-points',
    type: 'circle',
    source: PROFILE_SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'match',
        ['get', 'operatorStatus'],
        'ONLINE_NOW', '#36d486',
        'BUSY', '#f6b84b',
        'AVAILABLE_TODAY', '#35d9e6',
        'APPOINTMENT_ONLY', '#ff5fa2',
        'TRAVELING', '#9b6cff',
        '#9a9aa4'
      ],
      'circle-radius': 9,
      'circle-stroke-color': ['case', ['boolean', ['get', 'favorite'], false], '#ff5fa2', '#fff0ba'],
      'circle-stroke-width': ['case', ['boolean', ['get', 'favorite'], false], 4, 2]
    }
  });

  map.addSource(CENTER_SOURCE, { type: 'geojson', data: buildRadarCenterFeatureCollection(center) });
  map.addLayer({
    id: 'radar-center-halo',
    type: 'circle',
    source: CENTER_SOURCE,
    paint: { 'circle-radius': 18, 'circle-color': '#f4d77f', 'circle-opacity': 0.18 }
  });
  map.addLayer({
    id: 'radar-center-point',
    type: 'circle',
    source: CENTER_SOURCE,
    paint: {
      'circle-radius': 6,
      'circle-color': '#f4d77f',
      'circle-stroke-color': '#fff0ba',
      'circle-stroke-width': 2
    }
  });
}

function removeRadarSourcesAndLayers(map: MapLibreMap) {
  for (const layerId of [
    'radar-center-point',
    'radar-center-halo',
    'radar-profile-points',
    'radar-cluster-count',
    'radar-clusters',
    'radar-radius-line',
    'radar-radius-fill'
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of [CENTER_SOURCE, PROFILE_SOURCE, RADIUS_SOURCE]) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}

function bindRadarInteractions(
  map: MapLibreMap,
  itemsRef: React.MutableRefObject<RadarMapItem[]>,
  t: RadarMapLibreProps['t']
) {
  map.on('click', 'radar-clusters', async (event: MapMouseEvent) => {
    const feature = map.queryRenderedFeatures(event.point, { layers: ['radar-clusters'] })[0];
    const clusterId = Number(feature?.properties?.cluster_id);
    if (!Number.isFinite(clusterId)) return;
    const source = map.getSource(PROFILE_SOURCE) as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    const coordinates = (feature.geometry as { coordinates: [number, number] }).coordinates;
    map.easeTo({ center: coordinates, zoom });
  });

  map.on('click', 'radar-profile-points', (event: MapMouseEvent) => {
    const feature = map.queryRenderedFeatures(event.point, { layers: ['radar-profile-points'] })[0];
    const id = String(feature?.properties?.id || '');
    const item = itemsRef.current.find(({ profile }) => profile.id === id);
    if (!item) return;
    const coordinates = (feature.geometry as { coordinates: [number, number] }).coordinates;
    new maplibregl.Popup({ closeButton: true, maxWidth: '250px', offset: 14 })
      .setLngLat(coordinates)
      .setDOMContent(buildProfilePopup(item, t))
      .addTo(map);
  });

  for (const layer of ['radar-clusters', 'radar-profile-points']) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

function buildProfilePopup(item: RadarMapItem, t: RadarMapLibreProps['t']) {
  const { profile, distanceKm, operatorStatus, radarLocation } = item;
  const card = document.createElement('article');
  card.className = 'radar-map-popup';
  const cover = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
  if (cover?.public_url) {
    const image = document.createElement('img');
    image.src = cover.public_url;
    image.alt = '';
    image.loading = 'lazy';
    card.appendChild(image);
  }
  const body = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = profile.display_name;
  body.appendChild(name);
  appendPopupLine(body, operatorStatus.replaceAll('_', ' '));
  appendPopupLine(body, formatDistanceKm(distanceKm, t('radar.distanceUnavailable')));
  appendPopupLine(body, getPublicLocationLabel(profile, t));
  if (radarLocation.approximate) appendPopupLine(body, t('radar.approximateLocation'), 'radar-popup-approximate');
  const link = document.createElement('a');
  link.href = `/profile/${encodeURIComponent(profile.id)}`;
  link.textContent = t('radar.openProfile');
  body.appendChild(link);
  card.appendChild(body);
  return card;
}

function appendPopupLine(parent: HTMLElement, text: string, className = '') {
  if (!text) return;
  const line = document.createElement('small');
  line.className = className;
  line.textContent = text;
  parent.appendChild(line);
}

function setSourceData(map: MapLibreMap, sourceId: string, data: ReturnType<typeof buildRadarProfileFeatureCollection> | ReturnType<typeof buildRadarCenterFeatureCollection> | ReturnType<typeof buildRadarRadiusFeatureCollection>) {
  (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}
