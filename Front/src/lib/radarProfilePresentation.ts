import type { Profile } from '../types';
import { getPublicProfilePrimaryImage } from './publicProfiles';

export const RADAR_STATUS_COLORS = {
  ONLINE_NOW: '#36d486',
  BUSY: '#f6b84b',
  AVAILABLE_TODAY: '#35d9e6',
  APPOINTMENT_ONLY: '#ff5fa2',
  TRAVELING: '#9b6cff',
  OFFLINE: '#9a9aa4'
} as const;

const statusClasses: Record<string, string> = {
  ONLINE_NOW: 'online-now',
  BUSY: 'busy',
  AVAILABLE_TODAY: 'available-today',
  APPOINTMENT_ONLY: 'appointment-only',
  TRAVELING: 'traveling',
  OFFLINE: 'offline'
};

const statusLabelKeys: Record<string, string> = {
  ONLINE_NOW: 'status.onlineNow',
  BUSY: 'status.busy',
  AVAILABLE_TODAY: 'status.availableToday',
  APPOINTMENT_ONLY: 'status.appointmentOnly',
  TRAVELING: 'status.traveling',
  OFFLINE: 'status.offline'
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function getRadarStatusClass(operatorStatus: string) {
  return statusClasses[operatorStatus] || statusClasses.OFFLINE;
}

export function getRadarStatusColor(operatorStatus: string) {
  return RADAR_STATUS_COLORS[operatorStatus as keyof typeof RADAR_STATUS_COLORS] || RADAR_STATUS_COLORS.OFFLINE;
}

export function getRadarStatusLabel(operatorStatus: string, t: Translate) {
  return t(statusLabelKeys[operatorStatus] || statusLabelKeys.OFFLINE);
}

export function getRadarProfileImageUrl(profile: Pick<Profile, 'profile_images'>) {
  return getPublicProfilePrimaryImage(profile)?.public_url || '';
}

export function getRadarProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'P'}${parts[1]?.[0] || ''}`.toUpperCase();
}

export function getRadarProfileHref(profile: Pick<Profile, 'id'>) {
  return `/profile/${encodeURIComponent(profile.id)}`;
}

export type RadarPricePresentation = {
  amount: number;
  currency: string;
  duration: '30 min' | '1 h' | '2 h' | '3 h' | 'night';
  label: string;
};

export function getRadarProfilePrice(profile: Pick<Profile, 'price_30min' | 'price_1h' | 'price_2h' | 'price_3h' | 'price_night' | 'currency'>): RadarPricePresentation | null {
  const candidates = [
    ['30 min', profile.price_30min],
    ['1 h', profile.price_1h],
    ['2 h', profile.price_2h],
    ['3 h', profile.price_3h],
    ['night', profile.price_night]
  ] as const;
  const match = candidates.find(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!match) return null;
  const amount = Number(match[1]);
  const currency = String(profile.currency || '').trim().toUpperCase();
  const formattedAmount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  return {
    amount,
    currency,
    duration: match[0],
    label: `${match[0]} · ${formattedAmount}${currency ? ` ${currency}` : ''}`
  };
}
