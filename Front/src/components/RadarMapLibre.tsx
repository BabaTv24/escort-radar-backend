import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed } from 'lucide-react';
import { formatDistanceKm, isValidLatLng } from '../lib/geo';
import { getPublicLocationLabel } from '../lib/locationLabels';
import {
  RADAR_STATUS_COLORS,
  getRadarProfileHref,
  getRadarProfileImageUrl,
  getRadarProfileInitials,
  getRadarProfilePrice,
  getRadarStatusClass,
  getRadarStatusLabel
} from '../lib/radarProfilePresentation';
import {
  buildRadarCenterFeatureCollection,
  buildRadarProfileFeatureCollection,
  buildRadarRadiusFeatureCollection,
  getRadarRadiusBounds
} from '../lib/radarMapData';
import type { RadarMapItem } from '../lib/radarMapData';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const EXACT_PROFILE_SOURCE = 'radar-exact-profiles';
const APPROXIMATE_PROFILE_SOURCE = 'radar-approximate-profiles';
const RADIUS_SOURCE = 'radar-radius';
const CENTER_SOURCE = 'radar-center';
const RICH_MARKER_MIN_ZOOM = 11;
const FALLBACK_MAP_STYLE = {
  version: 8,
  name: 'Escort Radar dark fallback',
  sources: {},
  layers: [{
    id: 'escort-radar-dark-background',
    type: 'background',
    paint: { 'background-color': '#080b0f' }
  }]
} as StyleSpecification;

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
  const richMarkersRef = useRef<Map<string, RichMarkerEntry>>(new Map());
  const itemsRef = useRef(items);
  const longitude = searchCenter[0];
  const latitude = searchCenter[1];
  const center = { lng: longitude, lat: latitude };
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapStyleName, setMapStyleName] = useState('dark');
  const [reloadKey, setReloadKey] = useState(0);
  const richMarkerSignature = buildRichMarkerSignature(items);
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

    loadRadarMapStyle()
      .then(({ style, name }) => {
        if (!active || !containerRef.current) return;
        setMapStyleName(name);
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
      clearRichProfileMarkers(richMarkersRef.current);
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [reloadKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setSourceData(
      map,
      EXACT_PROFILE_SOURCE,
      buildRadarProfileFeatureCollection(items.filter((item) => !item.isApproximateLocation))
    );
    setSourceData(
      map,
      APPROXIMATE_PROFILE_SOURCE,
      buildRadarProfileFeatureCollection(items.filter((item) => item.isApproximateLocation))
    );
  }, [items, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    syncRichProfileMarkers(map, richMarkersRef.current, itemsRef.current, t);
    const updateMarkerZoom = () => updateRichMarkerZoom(map, richMarkersRef.current);
    map.on('zoom', updateMarkerZoom);
    updateMarkerZoom();
    return () => {
      map.off('zoom', updateMarkerZoom);
      clearRichProfileMarkers(richMarkersRef.current);
    };
  }, [mapReady, richMarkerSignature]);

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
      data-map-style={mapStyleName}
      data-approximate-count={items.filter((item) => item.isApproximateLocation).length}
      data-exact-count={items.filter((item) => !item.isApproximateLocation).length}
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

async function loadRadarMapStyle() {
  try {
    const response = await fetch(MAP_STYLE);
    if (!response.ok) throw new Error(`Map style HTTP ${response.status}`);
    return { style: await response.json() as StyleSpecification, name: 'dark' };
  } catch {
    return { style: FALLBACK_MAP_STYLE, name: 'dark-fallback' };
  }
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

  map.addSource(EXACT_PROFILE_SOURCE, {
    type: 'geojson',
    data: buildRadarProfileFeatureCollection(items.filter((item) => !item.isApproximateLocation)),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 42
  });
  map.addLayer({
    id: 'radar-clusters',
    type: 'circle',
    source: EXACT_PROFILE_SOURCE,
    maxzoom: RICH_MARKER_MIN_ZOOM,
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
    source: EXACT_PROFILE_SOURCE,
    maxzoom: RICH_MARKER_MIN_ZOOM,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12
    },
    paint: { 'text-color': '#ffffff' }
  });
  map.addLayer({
    id: 'radar-profile-points',
    type: 'circle',
    source: EXACT_PROFILE_SOURCE,
    maxzoom: RICH_MARKER_MIN_ZOOM,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': [
        'match',
        ['get', 'operatorStatus'],
        'ONLINE_NOW', RADAR_STATUS_COLORS.ONLINE_NOW,
        'BUSY', RADAR_STATUS_COLORS.BUSY,
        'AVAILABLE_TODAY', RADAR_STATUS_COLORS.AVAILABLE_TODAY,
        'APPOINTMENT_ONLY', RADAR_STATUS_COLORS.APPOINTMENT_ONLY,
        'TRAVELING', RADAR_STATUS_COLORS.TRAVELING,
        RADAR_STATUS_COLORS.OFFLINE
      ],
      'circle-radius': 9,
      'circle-stroke-color': ['case', ['boolean', ['get', 'favorite'], false], '#ff5fa2', '#fff0ba'],
      'circle-stroke-width': ['case', ['boolean', ['get', 'favorite'], false], 4, 2]
    }
  });

  map.addSource(APPROXIMATE_PROFILE_SOURCE, {
    type: 'geojson',
    data: buildRadarProfileFeatureCollection(items.filter((item) => item.isApproximateLocation)),
    cluster: false
  });
  map.addLayer({
    id: 'radar-approximate-points',
    type: 'circle',
    source: APPROXIMATE_PROFILE_SOURCE,
    maxzoom: RICH_MARKER_MIN_ZOOM,
    paint: {
      'circle-color': [
        'match',
        ['get', 'operatorStatus'],
        'ONLINE_NOW', RADAR_STATUS_COLORS.ONLINE_NOW,
        'BUSY', RADAR_STATUS_COLORS.BUSY,
        'AVAILABLE_TODAY', RADAR_STATUS_COLORS.AVAILABLE_TODAY,
        'APPOINTMENT_ONLY', RADAR_STATUS_COLORS.APPOINTMENT_ONLY,
        'TRAVELING', RADAR_STATUS_COLORS.TRAVELING,
        RADAR_STATUS_COLORS.OFFLINE
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 8, 4, 14, 7, 18, 9],
      'circle-opacity': 0,
      'circle-stroke-color': ['case', ['boolean', ['get', 'favorite'], false], '#ff5fa2', '#fff0ba'],
      'circle-stroke-width': ['case', ['boolean', ['get', 'favorite'], false], 3, 1.5],
      'circle-stroke-opacity': 0
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
    'radar-approximate-points',
    'radar-profile-points',
    'radar-cluster-count',
    'radar-clusters',
    'radar-radius-line',
    'radar-radius-fill'
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of [CENTER_SOURCE, APPROXIMATE_PROFILE_SOURCE, EXACT_PROFILE_SOURCE, RADIUS_SOURCE]) {
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
    const source = map.getSource(EXACT_PROFILE_SOURCE) as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    const coordinates = (feature.geometry as { coordinates: [number, number] }).coordinates;
    map.easeTo({ center: coordinates, zoom });
  });

  for (const layer of ['radar-profile-points', 'radar-approximate-points']) {
    map.on('click', layer, (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [layer] })[0];
      const id = String(feature?.properties?.id || '');
      const item = itemsRef.current.find(({ profile }) => profile.id === id);
      if (!item) return;
      const coordinates = (feature.geometry as { coordinates: [number, number] }).coordinates;
      new maplibregl.Popup({ closeButton: true, maxWidth: '250px', offset: 14 })
        .setLngLat(coordinates)
        .setDOMContent(buildProfilePopup(item, t))
        .addTo(map);
    });
  }

  for (const layer of ['radar-clusters', 'radar-profile-points', 'radar-approximate-points']) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  }
}

type RichMarkerEntry = {
  element: HTMLAnchorElement;
  marker: maplibregl.Marker;
  popup: maplibregl.Popup | null;
  approximate: boolean;
  cancelClose: () => void;
};

function syncRichProfileMarkers(
  map: MapLibreMap,
  markers: Map<string, RichMarkerEntry>,
  items: RadarMapItem[],
  t: RadarMapLibreProps['t']
) {
  clearRichProfileMarkers(markers);
  for (const item of items) {
    const { profile, displayCoordinates, operatorStatus, favorite } = item;
    const href = getRadarProfileHref(profile);
    const statusClass = getRadarStatusClass(operatorStatus);
    const statusLabel = getRadarStatusLabel(operatorStatus, t);
    const markerElement = document.createElement('a');
    markerElement.className = `radar-profile-marker ${statusClass}`;
    markerElement.dataset.profileId = profile.id;
    markerElement.dataset.operatorStatus = operatorStatus;
    markerElement.href = href;
    markerElement.draggable = false;
    markerElement.setAttribute('aria-label', `${profile.display_name}, ${statusLabel}`);
    markerElement.title = `${profile.display_name} · ${statusLabel}`;

    const fallback = document.createElement('span');
    fallback.className = 'radar-profile-marker-fallback';
    fallback.textContent = getRadarProfileInitials(profile.display_name);
    markerElement.appendChild(fallback);

    const imageUrl = getRadarProfileImageUrl(profile);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = profile.display_name;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => markerElement.classList.add('has-image-error'), { once: true });
      markerElement.classList.add('has-image');
      markerElement.appendChild(image);
    }

    if (favorite) {
      const heart = document.createElement('span');
      heart.className = 'radar-profile-marker-favorite';
      heart.textContent = '♥';
      heart.setAttribute('aria-hidden', 'true');
      markerElement.appendChild(heart);
    }

    let closeTimer: number | null = null;
    const cancelClose = () => {
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = null;
    };
    const popupCard = buildProfilePopup(item, t);
    let entry: RichMarkerEntry;
    const showPopup = () => {
      cancelClose();
      closeOtherRichProfilePopups(markers, profile.id);
      if (!entry.popup?.isOpen()) {
        entry.popup?.remove();
        entry.popup = new maplibregl.Popup({
          anchor: getRadarPopupAnchor(map, displayCoordinates),
          closeButton: false,
          closeOnClick: true,
          maxWidth: '290px',
          offset: 24
        })
          .setDOMContent(popupCard)
          .setLngLat([displayCoordinates.lng, displayCoordinates.lat])
          .addTo(map);
        entry.popup.on('close', () => {
          cancelClose();
          markerElement.classList.remove('is-active');
        });
        const activePopup = entry.popup;
        window.requestAnimationFrame(() => {
          if (activePopup.isOpen()) clampRadarPopupToMapViewport(map, activePopup);
        });
      }
      markerElement.classList.add('is-active');
    };
    const scheduleClose = () => {
      cancelClose();
      closeTimer = window.setTimeout(() => entry.popup?.remove(), 180);
    };

    markerElement.addEventListener('mouseenter', showPopup);
    markerElement.addEventListener('mouseleave', scheduleClose);
    markerElement.addEventListener('focus', showPopup);
    markerElement.addEventListener('blur', scheduleClose);
    markerElement.addEventListener('keydown', (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      showPopup();
    });
    markerElement.addEventListener('click', (event) => {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      event.preventDefault();
      event.stopPropagation();
      showPopup();
    });
    popupCard.addEventListener('mouseenter', cancelClose);
    popupCard.addEventListener('mouseleave', scheduleClose);

    const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
      .setLngLat([displayCoordinates.lng, displayCoordinates.lat])
      .addTo(map);
    entry = { element: markerElement, marker, popup: null, approximate: item.isApproximateLocation, cancelClose };
    markers.set(profile.id, entry);
  }
}

function clearRichProfileMarkers(markers: Map<string, RichMarkerEntry>) {
  for (const entry of markers.values()) {
    entry.cancelClose();
    entry.popup?.remove();
    entry.marker.remove();
  }
  markers.clear();
}

function closeOtherRichProfilePopups(markers: Map<string, RichMarkerEntry>, activeProfileId: string) {
  for (const [profileId, entry] of markers) {
    if (profileId === activeProfileId) continue;
    entry.cancelClose();
    entry.popup?.remove();
    entry.element.classList.remove('is-active');
  }
}

function getRadarPopupAnchor(
  map: MapLibreMap,
  coordinates: { lat: number; lng: number }
): 'top' | 'top-left' | 'top-right' | 'bottom' | 'bottom-left' | 'bottom-right' {
  const point = map.project([coordinates.lng, coordinates.lat]);
  const container = map.getContainer();
  const verticalAnchor = point.y < container.clientHeight / 2 ? 'top' : 'bottom';
  if (point.x < container.clientWidth * .3) return `${verticalAnchor}-left`;
  if (point.x > container.clientWidth * .7) return `${verticalAnchor}-right`;
  return verticalAnchor;
}

function clampRadarPopupToMapViewport(map: MapLibreMap, popup: maplibregl.Popup) {
  const popupElement = popup.getElement();
  const popupRect = popupElement.getBoundingClientRect();
  const mapRect = map.getContainer().getBoundingClientRect();
  const padding = 8;
  const leftBoundary = Math.max(mapRect.left + padding, padding);
  const rightBoundary = Math.min(mapRect.right - padding, window.innerWidth - padding);
  const topBoundary = Math.max(mapRect.top + padding, padding);
  const bottomBoundary = Math.min(mapRect.bottom - padding, window.innerHeight - padding);
  let shiftX = 0;
  let shiftY = 0;
  if (popupRect.left < leftBoundary) shiftX = leftBoundary - popupRect.left;
  else if (popupRect.right > rightBoundary) shiftX = rightBoundary - popupRect.right;
  if (popupRect.top < topBoundary) shiftY = topBoundary - popupRect.top;
  else if (popupRect.bottom > bottomBoundary) shiftY = bottomBoundary - popupRect.bottom;
  popupElement.style.translate = `${Math.round(shiftX)}px ${Math.round(shiftY)}px`;
}

function updateRichMarkerZoom(map: MapLibreMap, markers: Map<string, RichMarkerEntry>) {
  const zoom = map.getZoom();
  const showRichMarkers = zoom >= RICH_MARKER_MIN_ZOOM;
  const sizeClass = zoom < RICH_MARKER_MIN_ZOOM
    ? 'is-far'
    : zoom >= 15
      ? 'is-near'
      : zoom >= 12.5
        ? 'is-medium'
        : 'is-compact';
  for (const entry of markers.values()) {
    const markerVisible = showRichMarkers || entry.approximate;
    entry.element.hidden = !markerVisible;
    if (!markerVisible) {
      entry.cancelClose();
      entry.popup?.remove();
      entry.element.classList.remove('is-active');
    }
    entry.element.classList.remove('is-far', 'is-compact', 'is-medium', 'is-near');
    entry.element.classList.add(sizeClass);
  }
}

function buildRichMarkerSignature(items: RadarMapItem[]) {
  return items.map((item) => [
    item.profile.id,
    item.displayCoordinates.lat,
    item.displayCoordinates.lng,
    item.operatorStatus,
    item.favorite,
    getRadarProfileImageUrl(item.profile),
    item.profile.price_30min,
    item.profile.price_1h,
    item.profile.price_2h,
    item.profile.price_3h,
    item.profile.price_night,
    item.profile.currency
  ].join(':')).join('|');
}

export function buildProfilePopup(item: RadarMapItem, t: RadarMapLibreProps['t']) {
  const { profile, distanceKm, operatorStatus, isApproximateLocation } = item;
  const card = document.createElement('article');
  card.className = 'radar-map-popup';
  card.dataset.profileId = profile.id;
  const href = getRadarProfileHref(profile);
  card.dataset.profileHref = href;
  const media = document.createElement('div');
  media.className = 'radar-map-popup-media';
  const imageUrl = getRadarProfileImageUrl(profile);
  const fallback = document.createElement('span');
  fallback.className = 'radar-map-popup-fallback';
  fallback.textContent = getRadarProfileInitials(profile.display_name);
  media.appendChild(fallback);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = profile.display_name;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => media.classList.add('has-image-error'), { once: true });
    media.classList.add('has-image');
    media.appendChild(image);
  }
  card.appendChild(media);
  const body = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'radar-map-popup-heading';
  const name = document.createElement('strong');
  name.textContent = profile.display_name;
  heading.appendChild(name);
  if (Number(profile.age) > 0) {
    const age = document.createElement('small');
    age.textContent = t('profile.ageYears', { age: Number(profile.age) });
    heading.appendChild(age);
  }
  body.appendChild(heading);
  appendPopupLine(body, getRadarStatusLabel(operatorStatus, t), `radar-popup-status ${getRadarStatusClass(operatorStatus)}`);
  if (profile.category) appendPopupLine(body, profile.category, 'radar-popup-category');
  const price = getRadarProfilePrice(profile);
  if (price) appendPopupLine(body, price.label, 'radar-popup-price');
  appendPopupLine(body, formatDistanceKm(distanceKm, t('radar.distanceUnavailable')));
  appendPopupLine(body, getPublicLocationLabel(profile, t));
  if (isApproximateLocation) appendPopupLine(body, t('radar.approximateLocation'), 'radar-popup-approximate');
  const link = document.createElement('a');
  link.href = href;
  link.textContent = t('radar.openProfile');
  body.appendChild(link);
  card.appendChild(body);
  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) return;
    window.location.assign(href);
  });
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
