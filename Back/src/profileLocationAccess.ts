export type ExactLocationAccessInput = {
  isAdmin: boolean;
  isOwner: boolean;
  isClient: boolean;
  hasActivePremium: boolean;
  visibility: 'exact' | 'postal_area' | 'city_only' | 'hidden';
};

export function canReadExactProfileLocation(input: ExactLocationAccessInput) {
  return input.isAdmin
    || input.isOwner
    || (input.isClient && input.hasActivePremium && input.visibility === 'exact');
}

export function exactProfileLocationPayload(profile: Record<string, unknown>) {
  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude, precision: 'exact' as const };
}
