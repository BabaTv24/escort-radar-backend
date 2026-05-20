import type { Profile, ProfileImage } from '../types';

const areas = {
  berlin: ['Mitte', 'Charlottenburg', 'Prenzlauer Berg', 'Kreuzberg', 'Friedrichshain', 'Wilmersdorf'],
  hamburg: ['St. Pauli', 'Eimsbuttel', 'Altona', 'HafenCity', 'Winterhude', 'Sternschanze'],
  hannover: ['Mitte', 'List', 'Sudstadt', 'Linden', 'Oststadt', 'Zoo'],
  koeln: ['Innenstadt', 'Ehrenfeld', 'Deutz', 'Nippes', 'Lindenthal', 'Rheinauhafen'],
  muenchen: ['Altstadt', 'Schwabing', 'Maxvorstadt', 'Glockenbach', 'Haidhausen', 'Bogenhausen'],
  warszawa: ['Srodmiescie', 'Mokotow', 'Wola', 'Praga', 'Ochota', 'Zoliborz']
};

const cityCenters = {
  berlin: { lat: 52.52, lng: 13.405 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  hannover: { lat: 52.3759, lng: 9.732 },
  koeln: { lat: 50.9375, lng: 6.9603 },
  muenchen: { lat: 48.1351, lng: 11.582 },
  warszawa: { lat: 52.2297, lng: 21.0122 }
};

const names = [
  'Mila', 'Nora', 'Elena', 'Sofia', 'Lina', 'Amara', 'Vera', 'Nika',
  'Alina', 'Mara', 'Eva', 'Lea', 'Iris', 'Kira', 'Livia', 'Selin',
  'Anya', 'Noemi', 'Lara', 'Mina', 'Rosa', 'Clara', 'Yara', 'Nina'
];

const categories = ['ladies', 'gay', 'couples', 'trans', 'massage', 'house_hotel', 'live_cam', 'clubs_parties', 'other'];
const orientations = ['straight', 'bisexual', 'queer-friendly'];
const audienceOptions = [['men'], ['women'], ['couples'], ['men', 'couples'], ['women', 'couples']];
const visitTypeOptions = [['incall', 'private'], ['outcall', 'hotel'], ['incall', 'hotel'], ['private'], ['outcall']];
const serviceTagOptions = [
  ['dinner-date', 'social-time'],
  ['wellness', 'conversation'],
  ['vip-companion', 'events'],
  ['nightlife', 'late-night'],
  ['private-meeting', 'discreet']
];
const paymentOptions = [['cash'], ['card'], ['cash', 'card'], ['bank-transfer'], ['cash', 'bank-transfer']];
const bodyTypes = ['slim', 'athletic', 'curvy', 'classic', 'plus'];
const hairColors = ['black', 'brown', 'blonde', 'red', 'dark-blonde'];
const origins = ['local', 'european', 'latin', 'asian', 'mixed', 'international'];
const experienceTypes = ['newcomer', 'independent', 'premium', 'vip', 'studio'];
const bodyFeatures = [['tattoos'], ['natural look'], ['piercing'], ['elegant style'], ['fitness style'], ['classic style']];
const serviceNames = ['dinner-date', 'social-time', 'hotel', 'outcall', 'private-meeting', 'events', 'late-night', 'wellness'];
const palettes = [
  ['#1a1015', '#f7d46b', '#08f7b8'],
  ['#120f1c', '#c9a34a', '#ff4fb8'],
  ['#090f13', '#e9c767', '#19c9ff'],
  ['#160d0d', '#d4af37', '#ff775c']
];

function demoImage(seed: number, label: string): ProfileImage {
  const palette = palettes[seed % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 860"><defs><radialGradient id="g" cx="35%" cy="20%"><stop offset="0" stop-color="${palette[2]}" stop-opacity=".55"/><stop offset=".45" stop-color="${palette[1]}" stop-opacity=".28"/><stop offset="1" stop-color="${palette[0]}"/></radialGradient><linearGradient id="s" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${palette[1]}" stop-opacity=".35"/><stop offset="1" stop-color="#050505" stop-opacity=".9"/></linearGradient></defs><rect width="640" height="860" fill="url(#g)"/><circle cx="320" cy="290" r="118" fill="url(#s)" stroke="${palette[1]}" stroke-width="7"/><path d="M160 760c28-160 292-160 320 0" fill="url(#s)" stroke="${palette[1]}" stroke-width="7"/><path d="M90 130h460M90 690h460" stroke="${palette[1]}" stroke-opacity=".24" stroke-width="2"/><text x="48" y="812" fill="${palette[1]}" font-family="Arial" font-size="34" font-weight="700">${label}</text></svg>`;

  return {
    id: `demo-image-${seed}`,
    storage_path: `demo/${seed}.svg`,
    public_url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    is_primary: seed % 3 === 0,
    is_blurred: false
  };
}

function createCityProfiles(city: keyof typeof areas, count: number, offset: number): Profile[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = offset + index;
    const name = names[seed % names.length];
    const area = areas[city][index % areas[city].length];
    const age = 22 + (seed % 14);
    const languages = ['EN', seed % 2 === 0 ? 'DE' : 'PL', seed % 5 === 0 ? 'ES' : ''].filter(Boolean);
    const currency = 'EUR';
    const basePrice = 120 + (seed % 8) * 20;
    const availability_status = index % 10 < 5 ? 'available' : index % 10 < 8 ? 'busy' : 'unavailable';
    const center = cityCenters[city];
    const coordinateOffset = ((index % 7) - 3) * 0.045;
    const service_menu = serviceNames.map((serviceName, serviceIndex) => ({
      name: serviceName,
      enabled: serviceIndex < 5 || (seed + serviceIndex) % 3 === 0,
      included: serviceIndex < 2,
      extra_price: serviceIndex < 2 ? null : 30 + ((seed + serviceIndex) % 5) * 20,
      note: serviceIndex % 3 === 0 ? 'Demo option, details verified before publication.' : null
    }));

    return {
      id: `demo-${city}-${index + 1}`,
      display_name: `${name} ${index + 1}`,
      age,
      slug: `demo-${city}-${index + 1}`,
      city,
      area,
      category: categories[seed % categories.length],
      description: 'Fictional demo profile for layout preview. Real advertiser content appears only after verification and moderation.',
      languages,
      height: 158 + (seed % 24),
      body_type: bodyTypes[seed % bodyTypes.length],
      body_features: bodyFeatures[seed % bodyFeatures.length],
      hair_color: hairColors[seed % hairColors.length],
      origin: origins[seed % origins.length],
      experience_type: experienceTypes[seed % experienceTypes.length],
      orientation: orientations[seed % orientations.length],
      audience: audienceOptions[seed % audienceOptions.length],
      visit_types: visitTypeOptions[seed % visitTypeOptions.length],
      service_tags: serviceTagOptions[seed % serviceTagOptions.length],
      payment_methods: paymentOptions[seed % paymentOptions.length],
      availability_note: index % 2 === 0 ? 'Evening availability, schedule confirmed after moderation.' : 'Flexible schedule placeholder for verified advertisers.',
      price_30min: basePrice,
      price_1h: basePrice + 80,
      price_2h: basePrice * 2 + 120,
      price_night: basePrice * 5,
      outcall_fee: seed % 2 === 0 ? 40 : 70,
      currency,
      service_menu,
      availability_status,
      service_radius_km: [5, 10, 15, 20, 25, 50, 100][seed % 7],
      approximate_location_area: area,
      latitude: center.lat + coordinateOffset,
      longitude: center.lng + (((seed % 9) - 4) * 0.055),
      distance_km: null,
      available_now: availability_status === 'available',
      mobile_service: index % 2 === 0,
      private_studio: index % 4 !== 0,
      verified: index % 3 === 0,
      status: 'active',
      subscription_status: 'demo',
      trial_ends_at: null,
      profile_images: [demoImage(seed, name), demoImage(seed + 40, area), demoImage(seed + 80, city)]
    };
  });
}

export const demoProfiles: Profile[] = [
  ...createCityProfiles('berlin', 24, 1),
  ...createCityProfiles('hamburg', 12, 101),
  ...createCityProfiles('hannover', 12, 201),
  ...createCityProfiles('koeln', 8, 301),
  ...createCityProfiles('muenchen', 8, 401),
  ...createCityProfiles('warszawa', 8, 501)
];

export function getDemoProfiles(city?: string) {
  return demoProfiles.filter((profile) => !city || profile.city === city);
}

export function getDemoProfile(id: string) {
  return demoProfiles.find((profile) => profile.id === id);
}
