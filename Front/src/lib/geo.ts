import type { Profile } from '../types';
import { normalizeCategoryKey } from './categories';

export type GeoPoint = {
  lat: number;
  lng: number;
  source: 'browser' | 'manual' | 'manual_saved' | 'city' | 'city_fallback';
  label?: string;
};

export type ProfileRadarLocation = {
  lat: number;
  lng: number;
  label: string;
  precision: 'exact' | 'postal_area' | 'area' | 'city' | 'city_fallback' | 'approximate';
  approximate: boolean;
};

export const clientSearchLocationStorageKey = 'escortRadar.clientSearchLocation';
export const MIN_RADAR_RADIUS_METERS = 10;
export const MAX_RADAR_RADIUS_METERS = 150_000;
export const DEFAULT_RADAR_RADIUS_METERS = 25_000;

const cityCenters: Record<string, { lat: number; lng: number }> = {
  berlin: { lat: 52.52, lng: 13.405 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  hannover: { lat: 52.3759, lng: 9.732 },
  koeln: { lat: 50.9375, lng: 6.9603 },
  muenchen: { lat: 48.1351, lng: 11.582 },
  warszawa: { lat: 52.2297, lng: 21.0122 },
  swiebodzin: { lat: 52.2475, lng: 15.5336 },
  poznan: { lat: 52.4064, lng: 16.9252 },
  krakow: { lat: 50.0647, lng: 19.945 },
  wroclaw: { lat: 51.1079, lng: 17.0385 },
  gdansk: { lat: 54.352, lng: 18.6466 },
  lodz: { lat: 51.7592, lng: 19.456 },
  szczecin: { lat: 53.4285, lng: 14.5528 },
  katowice: { lat: 50.2649, lng: 19.0238 },
  lublin: { lat: 51.2465, lng: 22.5684 },
  bydgoszcz: { lat: 53.1235, lng: 18.0084 },
  'frankfurt am main': { lat: 50.1109, lng: 8.6821 },
  duesseldorf: { lat: 51.2277, lng: 6.7735 },
  dusseldorf: { lat: 51.2277, lng: 6.7735 },
  stuttgart: { lat: 48.7758, lng: 9.1829 },
  dortmund: { lat: 51.5136, lng: 7.4653 },
  leipzig: { lat: 51.3397, lng: 12.3731 },
  bremen: { lat: 53.0793, lng: 8.8017 },
  nuernberg: { lat: 49.4521, lng: 11.0767 },
  nurnberg: { lat: 49.4521, lng: 11.0767 },
  dresden: { lat: 51.0504, lng: 13.7373 },
  essen: { lat: 51.4556, lng: 7.0116 },
  duisburg: { lat: 51.4344, lng: 6.7623 },
  bochum: { lat: 51.4818, lng: 7.2162 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  rotterdam: { lat: 51.9244, lng: 4.4777 },
  'den haag': { lat: 52.0705, lng: 4.3007 },
  utrecht: { lat: 52.0907, lng: 5.1214 },
  eindhoven: { lat: 51.4416, lng: 5.4697 },
  brussels: { lat: 50.8503, lng: 4.3517 },
  antwerp: { lat: 51.2194, lng: 4.4025 },
  gent: { lat: 51.0543, lng: 3.7174 },
  liege: { lat: 50.6326, lng: 5.5797 },
  luxembourg: { lat: 49.6116, lng: 6.1319 },
  wien: { lat: 48.2082, lng: 16.3738 },
  graz: { lat: 47.0707, lng: 15.4395 },
  linz: { lat: 48.3069, lng: 14.2858 },
  salzburg: { lat: 47.8095, lng: 13.055 },
  zuerich: { lat: 47.3769, lng: 8.5417 },
  zurich: { lat: 47.3769, lng: 8.5417 },
  basel: { lat: 47.5596, lng: 7.5886 },
  bern: { lat: 46.948, lng: 7.4474 },
  geneve: { lat: 46.2044, lng: 6.1432 },
  geneva: { lat: 46.2044, lng: 6.1432 },
  lausanne: { lat: 46.5197, lng: 6.6323 },
  praha: { lat: 50.0755, lng: 14.4378 },
  brno: { lat: 49.1951, lng: 16.6068 },
  ostrava: { lat: 49.8209, lng: 18.2625 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  barcelona: { lat: 41.3874, lng: 2.1686 },
  valencia: { lat: 39.4699, lng: -0.3763 },
  sevilla: { lat: 37.3891, lng: -5.9845 },
  malaga: { lat: 36.7213, lng: -4.4214 },
  paris: { lat: 48.8566, lng: 2.3522 },
  lyon: { lat: 45.764, lng: 4.8357 },
  marseille: { lat: 43.2965, lng: 5.3698 },
  nice: { lat: 43.7102, lng: 7.262 },
  toulouse: { lat: 43.6047, lng: 1.4442 },
  roma: { lat: 41.9028, lng: 12.4964 },
  milano: { lat: 45.4642, lng: 9.19 },
  napoli: { lat: 40.8518, lng: 14.2681 },
  torino: { lat: 45.0703, lng: 7.6869 },
  firenze: { lat: 43.7696, lng: 11.2558 }
};

export const berlinDistrictOptions = [
  'Mitte',
  'Friedrichshain',
  'Kreuzberg',
  'Prenzlauer Berg',
  'Charlottenburg',
  'Wilmersdorf',
  'Schoeneberg',
  'Tempelhof',
  'Neukoelln',
  'Kreuzkoelln',
  'Wedding',
  'Moabit',
  'Tiergarten',
  'Lichtenberg',
  'Marzahn',
  'Hellersdorf',
  'Spandau',
  'Steglitz',
  'Zehlendorf',
  'Pankow',
  'Reinickendorf',
  'Treptow',
  'Koepenick',
  'Rudow',
  'Buckow',
  'Britz',
  'Friedrichshagen',
  'Kurfuerstenstrasse',
  'Alexanderplatz',
  'Potsdamer Platz',
  'Karlshorst',
  'Friedenau',
  'Lichterfelde',
  'Lankwitz',
  'Lichtenrade',
  'Oberschoeneweide',
  'Adlershof',
  'Altglienicke',
  'Bohnsdorf',
  'Gruenau',
  'Rahnsdorf',
  'Kaulsdorf',
  'Mahlsdorf',
  'Biesdorf',
  'Hohenschoenhausen',
  'Weissensee',
  'Heinersdorf',
  'Buch',
  'Franzoesisch Buchholz',
  'Blankenburg',
  'Blankenfelde',
  'Gesundbrunnen',
  'Maerkisches Viertel',
  'Wittenau',
  'Frohnau',
  'Hermsdorf',
  'Waidmannslust',
  'Heiligensee',
  'Tegel',
  'Staaken',
  'Wilhelmstadt',
  'Haselhorst',
  'Siemensstadt',
  'Westend',
  'Kladow',
  'Wannsee',
  'Nikolassee',
  'Grunewald',
  'Dahlem',
  'Schmargendorf'
];

const districtCenters: Record<string, { lat: number; lng: number; label: string }> = {
  berlin: { lat: 52.52, lng: 13.405, label: 'Berlin' },
  mitte: { lat: 52.52, lng: 13.405, label: 'Berlin Mitte' },
  friedrichshain: { lat: 52.5144, lng: 13.46, label: 'Berlin Friedrichshain' },
  kreuzberg: { lat: 52.5009, lng: 13.4194, label: 'Berlin Kreuzberg' },
  'prenzlauer berg': { lat: 52.5389, lng: 13.4246, label: 'Berlin Prenzlauer Berg' },
  charlottenburg: { lat: 52.5166, lng: 13.3041, label: 'Berlin Charlottenburg' },
  wilmersdorf: { lat: 52.4873, lng: 13.3203, label: 'Berlin Wilmersdorf' },
  schoeneberg: { lat: 52.486, lng: 13.355, label: 'Berlin Schoeneberg' },
  schoneberg: { lat: 52.486, lng: 13.355, label: 'Berlin Schoeneberg' },
  tempelhof: { lat: 52.4625, lng: 13.3857, label: 'Berlin Tempelhof' },
  neukolln: { lat: 52.481, lng: 13.435, label: 'Berlin Neukoelln' },
  neukoelln: { lat: 52.481, lng: 13.435, label: 'Berlin Neukoelln' },
  wedding: { lat: 52.55, lng: 13.3667, label: 'Berlin Wedding' },
  moabit: { lat: 52.53, lng: 13.34, label: 'Berlin Moabit' },
  tiergarten: { lat: 52.5145, lng: 13.35, label: 'Berlin Tiergarten' },
  lichtenberg: { lat: 52.52, lng: 13.49, label: 'Berlin Lichtenberg' },
  marzahn: { lat: 52.55, lng: 13.56, label: 'Berlin Marzahn' },
  hellersdorf: { lat: 52.536, lng: 13.604, label: 'Berlin Hellersdorf' },
  spandau: { lat: 52.535, lng: 13.2, label: 'Berlin Spandau' },
  steglitz: { lat: 52.456, lng: 13.32, label: 'Berlin Steglitz' },
  zehlendorf: { lat: 52.434, lng: 13.26, label: 'Berlin Zehlendorf' },
  pankow: { lat: 52.569, lng: 13.402, label: 'Berlin Pankow' },
  reinickendorf: { lat: 52.588, lng: 13.325, label: 'Berlin Reinickendorf' },
  treptow: { lat: 52.493, lng: 13.458, label: 'Berlin Treptow' },
  koepenick: { lat: 52.445, lng: 13.574, label: 'Berlin Koepenick' },
  kopenick: { lat: 52.445, lng: 13.574, label: 'Berlin Koepenick' },
  rudow: { lat: 52.42, lng: 13.497, label: 'Berlin Rudow' },
  buckow: { lat: 52.424, lng: 13.462, label: 'Berlin Buckow' },
  britz: { lat: 52.448, lng: 13.435, label: 'Berlin Britz' },
  friedrichshagen: { lat: 52.45, lng: 13.624, label: 'Berlin Friedrichshagen' },
  kurfurstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  kurfuerstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  alexanderplatz: { lat: 52.5219, lng: 13.4132, label: 'Berlin Alexanderplatz' },
  'potsdamer platz': { lat: 52.5096, lng: 13.376, label: 'Berlin Potsdamer Platz' },
  karlshorst: { lat: 52.482, lng: 13.525, label: 'Berlin Karlshorst' },
  friedenau: { lat: 52.471, lng: 13.328, label: 'Berlin Friedenau' },
  lichterfelde: { lat: 52.428, lng: 13.307, label: 'Berlin Lichterfelde' },
  lankwitz: { lat: 52.436, lng: 13.345, label: 'Berlin Lankwitz' },
  lichtenrade: { lat: 52.387, lng: 13.408, label: 'Berlin Lichtenrade' },
  adlershof: { lat: 52.435, lng: 13.548, label: 'Berlin Adlershof' },
  altglienicke: { lat: 52.411, lng: 13.54, label: 'Berlin Altglienicke' },
  gruenau: { lat: 52.414, lng: 13.58, label: 'Berlin Gruenau' },
  rahnsdorf: { lat: 52.442, lng: 13.69, label: 'Berlin Rahnsdorf' },
  westend: { lat: 52.516, lng: 13.255, label: 'Berlin Westend' },
  tegel: { lat: 52.589, lng: 13.279, label: 'Berlin Tegel' },
  wannsee: { lat: 52.421, lng: 13.159, label: 'Berlin Wannsee' },
  dahlem: { lat: 52.458, lng: 13.289, label: 'Berlin Dahlem' }
};

const postalDistricts: Record<string, string> = {
  '10115': 'Mitte', '10117': 'Mitte', '10119': 'Prenzlauer Berg',
  '10243': 'Friedrichshain', '10245': 'Friedrichshain', '10247': 'Friedrichshain', '10249': 'Friedrichshain',
  '10315': 'Lichtenberg', '10317': 'Lichtenberg', '10318': 'Karlshorst',
  '10405': 'Prenzlauer Berg', '10407': 'Prenzlauer Berg', '10409': 'Prenzlauer Berg',
  '10557': 'Moabit', '10585': 'Charlottenburg', '10623': 'Charlottenburg', '10625': 'Charlottenburg', '10627': 'Charlottenburg', '10629': 'Charlottenburg',
  '10707': 'Wilmersdorf', '10709': 'Wilmersdorf', '10711': 'Wilmersdorf', '10713': 'Wilmersdorf', '10715': 'Wilmersdorf', '10717': 'Wilmersdorf', '10719': 'Wilmersdorf',
  '10777': 'Schoeneberg', '10779': 'Schoeneberg', '10781': 'Schoeneberg', '10783': 'Schoeneberg', '10785': 'Kurfuerstenstrasse', '10787': 'Kurfuerstenstrasse',
  '10961': 'Kreuzberg', '10963': 'Kreuzberg', '10965': 'Kreuzberg', '10967': 'Kreuzberg', '10969': 'Kreuzberg', '10997': 'Kreuzberg', '10999': 'Kreuzberg',
  '12043': 'Neukoelln', '12045': 'Neukoelln', '12047': 'Neukoelln', '12049': 'Neukoelln', '12051': 'Neukoelln', '12053': 'Neukoelln', '12055': 'Neukoelln', '12057': 'Neukoelln', '12059': 'Neukoelln',
  '12099': 'Tempelhof', '12101': 'Tempelhof', '12103': 'Tempelhof', '12105': 'Tempelhof', '12107': 'Tempelhof', '12109': 'Tempelhof',
  '12157': 'Schoeneberg', '12159': 'Friedenau', '12161': 'Friedenau', '12163': 'Steglitz', '12165': 'Steglitz', '12167': 'Steglitz', '12169': 'Steglitz',
  '12203': 'Lichterfelde', '12205': 'Lichterfelde', '12207': 'Lichterfelde', '12209': 'Lichterfelde', '12247': 'Lankwitz', '12249': 'Lankwitz',
  '12305': 'Lichtenrade', '12307': 'Lichtenrade', '12309': 'Lichtenrade', '12347': 'Britz', '12349': 'Buckow', '12351': 'Buckow', '12353': 'Buckow', '12355': 'Rudow', '12357': 'Rudow', '12359': 'Britz',
  '12435': 'Treptow', '12437': 'Treptow', '12439': 'Treptow', '12459': 'Oberschoeneweide', '12487': 'Adlershof', '12489': 'Adlershof',
  '12524': 'Altglienicke', '12526': 'Bohnsdorf', '12527': 'Gruenau', '12555': 'Koepenick', '12557': 'Koepenick', '12559': 'Koepenick', '12587': 'Friedrichshagen', '12589': 'Rahnsdorf',
  '12619': 'Hellersdorf', '12621': 'Kaulsdorf', '12623': 'Mahlsdorf', '12627': 'Hellersdorf', '12629': 'Hellersdorf', '12679': 'Marzahn', '12681': 'Marzahn', '12683': 'Biesdorf', '12685': 'Marzahn', '12687': 'Marzahn', '12689': 'Marzahn',
  '13051': 'Hohenschoenhausen', '13053': 'Hohenschoenhausen', '13055': 'Hohenschoenhausen', '13057': 'Hohenschoenhausen', '13059': 'Hohenschoenhausen', '13086': 'Weissensee', '13088': 'Weissensee', '13089': 'Heinersdorf',
  '13125': 'Buch', '13127': 'Franzoesisch Buchholz', '13129': 'Blankenburg', '13156': 'Pankow', '13158': 'Pankow', '13159': 'Blankenfelde', '13187': 'Pankow', '13189': 'Pankow',
  '13347': 'Wedding', '13349': 'Wedding', '13351': 'Wedding', '13353': 'Wedding', '13355': 'Wedding', '13357': 'Gesundbrunnen', '13359': 'Wedding',
  '13403': 'Reinickendorf', '13405': 'Reinickendorf', '13407': 'Reinickendorf', '13409': 'Reinickendorf', '13435': 'Maerkisches Viertel', '13437': 'Wittenau', '13439': 'Maerkisches Viertel', '13465': 'Frohnau', '13467': 'Hermsdorf', '13469': 'Waidmannslust',
  '13503': 'Heiligensee', '13505': 'Heiligensee', '13507': 'Tegel', '13509': 'Tegel', '13581': 'Spandau', '13583': 'Spandau', '13585': 'Spandau', '13587': 'Spandau', '13589': 'Spandau', '13591': 'Staaken', '13593': 'Wilhelmstadt', '13595': 'Wilhelmstadt', '13597': 'Spandau', '13599': 'Haselhorst',
  '13627': 'Siemensstadt', '13629': 'Siemensstadt', '14050': 'Westend', '14052': 'Westend', '14053': 'Westend', '14055': 'Westend', '14057': 'Charlottenburg', '14059': 'Charlottenburg', '14089': 'Kladow',
  '14109': 'Wannsee', '14129': 'Nikolassee', '14163': 'Zehlendorf', '14165': 'Zehlendorf', '14167': 'Zehlendorf', '14169': 'Zehlendorf', '14193': 'Grunewald', '14195': 'Dahlem', '14197': 'Wilmersdorf', '14199': 'Schmargendorf'
};

const postalCenters = Object.fromEntries(Object.entries(postalDistricts).map(([postal, district]) => {
  const center = districtCenters[normalizeLocationQuery(district)] || cityCenters.berlin;
  return [postal, { ...center, label: `${postal} Berlin ${district}` }];
}));

const manualLocationCenters: Record<string, { lat: number; lng: number; label: string }> = {
  ...districtCenters,
  ...postalCenters,
  '10115': { lat: 52.5321, lng: 13.3849, label: '10115 Berlin' },
  '10117': { lat: 52.5155, lng: 13.3899, label: '10117 Berlin' },
  '10119': { lat: 52.5291, lng: 13.4109, label: '10119 Berlin' },
  '10243': { lat: 52.5124, lng: 13.4407, label: '10243 Berlin' },
  '10997': { lat: 52.499, lng: 13.437, label: '10997 Berlin Kreuzberg' },
  '10999': { lat: 52.4995, lng: 13.4314, label: '10999 Berlin' },
  '12043': { lat: 52.4808, lng: 13.4384, label: '12043 Berlin' },
  '12045': { lat: 52.4859, lng: 13.4294, label: '12045 Berlin' },
  '12047': { lat: 52.4898, lng: 13.4235, label: '12047 Berlin' },
  '12049': { lat: 52.4776, lng: 13.4196, label: '12049 Berlin' },
  '12353': { lat: 52.424, lng: 13.462, label: '12353 Berlin Buckow / Rudow' },
  '10785': { lat: 52.5068, lng: 13.3671, label: '10785 Berlin' },
  '10787': { lat: 52.5038, lng: 13.3438, label: '10787 Berlin' }
};

export function resolveBerlinPostalDistrict(value: string | null | undefined) {
  const postal = String(value || '').match(/\b\d{5}\b/)?.[0] || '';
  return postal ? postalDistricts[postal] || '' : '';
}

export function normalizeProfileCategory(value: unknown) {
  return normalizeCategoryKey(value);
}

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const distance = safeDistanceKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
  return distance;
}

export function safeDistanceKm(origin: { lat: unknown; lng: unknown }, target: { lat: unknown; lng: unknown }) {
  const lat1 = toCoordinate(origin.lat);
  const lng1 = toCoordinate(origin.lng);
  const lat2 = toCoordinate(target.lat);
  const lng2 = toCoordinate(target.lng);
  if (!isValidLatLng(lat1, lng1) || !isValidLatLng(lat2, lng2)) return null;

  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const distance = radius * 2 * Math.atan2(Math.sqrt(Math.max(a, 0)), Math.sqrt(Math.max(1 - a, 0)));
  return Number.isFinite(distance) ? Math.max(0, distance) : null;
}

export function getCityCenter(city: string) {
  return cityCenters[normalizeLocationQuery(city)] || cityCenters.berlin;
}

export function getProfileCoordinates(profile: Profile) {
  const raw = profile as Profile & Record<string, unknown>;
  const lat = toCoordinate(raw.latitude ?? raw.lat);
  const lng = toCoordinate(raw.longitude ?? raw.lng);
  if (isValidLatLng(lat, lng)) return { lat, lng };
  return cityCenters[normalizeLocationQuery(profile.work_city || profile.city)] || null;
}

export function isProfileInRadarRange(profile: Profile, searcherLocation: GeoPoint, selectedRadiusMeters = DEFAULT_RADAR_RADIUS_METERS) {
  const profileLocation = resolveProfileRadarLocation(profile);
  if (!profileLocation) return { inRange: false, distance_km: null };
  const distance = safeDistanceKm(searcherLocation, profileLocation);
  if (distance === null) return { inRange: false, distance_km: null };

  return {
    inRange: distance * 1000 <= selectedRadiusMeters,
    distance_km: Math.round(distance * 10) / 10
  };
}

export function getSearcherLocationWithFallback(city: string): Promise<GeoPoint> {
  const fallback = getCityCenter(city);

  if (!navigator.geolocation) {
    return Promise.resolve({ ...fallback, source: 'city', label: getCityLabel(city) });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: 'browser',
        label: 'GPS'
      }),
      () => resolve({ ...fallback, source: 'city', label: getCityLabel(city) }),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  });
}

export function resolveManualSearcherLocation(input: string): GeoPoint | null {
  const location = resolveKnownLocation(input);
  return location ? { ...location, source: 'manual' } : null;
}

export function readSavedSearchLocation(): GeoPoint | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(clientSearchLocationStorageKey) || 'null') as GeoPoint | null;
    return saved && isValidLatLng(saved.lat, saved.lng) ? { ...saved, source: 'manual_saved' } : null;
  } catch {
    return null;
  }
}

export function saveSearchLocationToStorage(location: GeoPoint) {
  if (typeof window === 'undefined' || !isValidLatLng(location.lat, location.lng)) return;
  window.localStorage.setItem(clientSearchLocationStorageKey, JSON.stringify({ ...location, source: 'manual_saved' }));
}

export function clearSavedSearchLocation() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(clientSearchLocationStorageKey);
}

export function resolveProfileRadarLocation(profile: Profile): ProfileRadarLocation | null {
  if (profile.location_visibility === 'hidden') return null;
  if (profile.location_mode === 'exact_hidden' || profile.location_mode === 'hidden') return null;

  const raw = profile as Profile & Record<string, unknown>;
  const lat = toCoordinate(raw.latitude ?? raw.lat);
  const lng = toCoordinate(raw.longitude ?? raw.lng);
  if (isValidLatLng(lat, lng)) {
    return {
      lat,
      lng,
      label: textValue(raw.work_place_label ?? raw.exact_address ?? raw.postal_code ?? raw.postalCode ?? raw.zip ?? raw.work_area ?? raw.area ?? raw.district ?? raw.work_city ?? raw.location_city ?? raw.city),
      precision: profile.location_precision === 'city' ? 'city' : profile.work_place_label || profile.exact_address ? 'exact' : profile.location_visibility === 'postal_area' ? 'postal_area' : 'approximate',
      approximate: profile.location_approximate === true || profile.location_precision === 'city' || profile.location_visibility !== 'exact'
    };
  }

  const city = textValue(raw.work_city ?? raw.city ?? raw.location_city);
  const postalCode = textValue(raw.postal_code ?? raw.postalCode ?? raw.zip);
  if (postalCode) {
    const postal = resolveKnownLocation(`${postalCode} ${city}`);
    if (postal) return { lat: postal.lat, lng: postal.lng, label: postal.label, precision: 'postal_area', approximate: true };
  }

  const area = textValue(raw.work_area ?? raw.area ?? raw.district ?? raw.approximate_location_area);
  if (area) {
    const areaLocation = resolveKnownLocation(`${area} ${city}`);
    if (areaLocation) return { lat: areaLocation.lat, lng: areaLocation.lng, label: areaLocation.label, precision: 'area', approximate: true };
  }

  const cityCenter = cityCenters[normalizeLocationQuery(city)];
  if (cityCenter) return { ...cityCenter, label: getCityLabel(city), precision: 'city_fallback', approximate: true };

  return null;
}

export function isValidLatLng(lat: unknown, lng: unknown) {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180;
}

export const isValidCoordinate = isValidLatLng;

export function formatDistanceKm(distanceKm: unknown, unavailableLabel = '') {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return unavailableLabel;
  if (distance < 0.1) return '< 100 m';
  if (distance < 10) return `${distance.toFixed(1)} km`;
  return `${Math.round(distance)} km`;
}

export function formatRadiusMeters(radiusMeters: unknown) {
  const meters = Number(radiusMeters);
  if (!Number.isFinite(meters) || meters <= 0) return '10 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const kilometers = meters / 1000;
  return Number.isInteger(kilometers) ? `${kilometers} km` : `${kilometers.toFixed(1)} km`;
}

function resolveKnownLocation(input: string) {
  const normalized = normalizeLocationQuery(input);
  if (!normalized) return null;
  const direct = manualLocationCenters[normalized];
  if (direct) return direct;

  const postalKey = normalizePostalCode(input);
  if (postalKey) {
    const postal = manualLocationCenters[postalKey] || resolveApproximatePostalLocation(postalKey);
    if (postal) return postal;
  }

  const city = cityCenters[normalized];
  if (city) return { ...city, label: getCityLabel(normalized) };

  const postalMatch = normalized.match(/\b\d{5}\b/);
  if (postalMatch && manualLocationCenters[postalMatch[0]]) return manualLocationCenters[postalMatch[0]];

  const matchedKey = Object.keys(manualLocationCenters)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));
  if (matchedKey) return manualLocationCenters[matchedKey];

  const matchedCityKey = Object.keys(cityCenters)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));
  return matchedCityKey ? { ...cityCenters[matchedCityKey], label: getCityLabel(matchedCityKey) } : null;
}

function normalizePostalCode(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  return compact.length >= 3 ? compact : '';
}

function resolveApproximatePostalLocation(postalCode: string) {
  if (/^6[01]\d{3}$/.test(postalCode)) {
    return { lat: 52.4064, lng: 16.9252, label: `${formatPolishPostalCode(postalCode)} Poznan` };
  }
  if (/^0[0-5]\d{3}$/.test(postalCode)) return { lat: 52.2297, lng: 21.0122, label: `${formatPolishPostalCode(postalCode)} Warszawa` };
  if (/^3[01]\d{3}$/.test(postalCode)) return { lat: 50.0647, lng: 19.945, label: `${formatPolishPostalCode(postalCode)} Krakow` };
  if (/^5[0-4]\d{3}$/.test(postalCode)) return { lat: 51.1079, lng: 17.0385, label: `${formatPolishPostalCode(postalCode)} Wroclaw` };
  if (/^8[0-4]\d{3}$/.test(postalCode)) return { lat: 54.352, lng: 18.6466, label: `${formatPolishPostalCode(postalCode)} Gdansk` };
  return null;
}

function formatPolishPostalCode(postalCode: string) {
  return /^\d{5}$/.test(postalCode) ? `${postalCode.slice(0, 2)}-${postalCode.slice(2)}` : postalCode;
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function toCoordinate(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function normalizeLocationQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCityLabel(city: string) {
  return city.slice(0, 1).toUpperCase() + city.slice(1);
}
