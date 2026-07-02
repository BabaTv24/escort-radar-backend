import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

type WorkPointMapProps = {
  apiKey: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  onChange: (point: { latitude: number; longitude: number }) => void;
};

let googleMapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string) {
  const existing = (window as any).google;
  if (existing?.maps) return Promise.resolve(existing);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const google = (window as any).google;
      google?.maps ? resolve(google) : reject(new Error('Google Maps unavailable'));
    };
    script.onerror = () => reject(new Error('Google Maps failed'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function WorkPointMap({ apiKey, latitude, longitude, onChange }: WorkPointMapProps) {
  const { t } = useI18n();
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    loadGoogleMaps(apiKey)
      .then((google) => {
        if (!active || !mapNode.current) return;
        const start = toPoint(latitude, longitude) || { lat: 52.52, lng: 13.405 };
        const map = new google.maps.Map(mapNode.current, {
          center: start,
          zoom: toPoint(latitude, longitude) ? 15 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });
        const marker = new google.maps.Marker({ map, position: start, draggable: true });
        const setPoint = (position: any) => {
          const point = { latitude: Number(position.lat().toFixed(6)), longitude: Number(position.lng().toFixed(6)) };
          marker.setPosition({ lat: point.latitude, lng: point.longitude });
          onChange(point);
        };
        map.addListener('click', (event: any) => event.latLng && setPoint(event.latLng));
        marker.addListener('dragend', (event: any) => event.latLng && setPoint(event.latLng));
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => setError(t('location.mapLoadFailed')));
    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    const point = toPoint(latitude, longitude);
    if (!point || !mapRef.current || !markerRef.current) return;
    markerRef.current.setPosition(point);
    mapRef.current.setCenter(point);
  }, [latitude, longitude]);

  if (!apiKey) return <p className="muted">{t('location.mapUnavailable')}</p>;

  return (
    <div className="work-point-map">
      <strong>{t('location.workPointMap')}</strong>
      <p className="muted">{t('location.clickMapToSet')}</p>
      {error ? <p className="error-text">{error}</p> : <div ref={mapNode} className="work-point-map-canvas" />}
    </div>
  );
}

function toPoint(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
