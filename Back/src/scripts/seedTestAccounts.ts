import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOW_TEST_SEED = process.env.ALLOW_TEST_SEED === 'true';

const adminEmails = new Set((process.env.ADMIN_EMAILS || 'admin@example.test').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const password = process.env.TEST_ACCOUNT_PASSWORD || 'change-me-local-test-password';
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const categories = ['ladies', 'gay', 'couples', 'trans', 'massage', 'house_hotel', 'live_cam', 'clubs_parties', 'other'];
const cities = ['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'];
const statuses = ['available', 'busy', 'unavailable'];
const radiuses = [5, 10, 15, 20, 25, 50, 100];

const cityAreas: Record<string, Array<{ area: string; lat: number; lng: number }>> = {
  berlin: [
    { area: 'Mitte', lat: 52.52, lng: 13.405 },
    { area: 'Charlottenburg', lat: 52.507, lng: 13.303 },
    { area: 'Friedrichshain', lat: 52.515, lng: 13.454 },
    { area: 'Kreuzberg', lat: 52.498, lng: 13.403 }
  ],
  hamburg: [
    { area: 'St. Pauli', lat: 53.549, lng: 9.96 },
    { area: 'HafenCity', lat: 53.541, lng: 9.999 },
    { area: 'Altona', lat: 53.55, lng: 9.935 }
  ],
  hannover: [
    { area: 'Mitte', lat: 52.375, lng: 9.732 },
    { area: 'List', lat: 52.397, lng: 9.754 },
    { area: 'Suedstadt', lat: 52.358, lng: 9.747 }
  ],
  koeln: [
    { area: 'Innenstadt', lat: 50.937, lng: 6.96 },
    { area: 'Deutz', lat: 50.938, lng: 6.974 },
    { area: 'Ehrenfeld', lat: 50.951, lng: 6.917 }
  ],
  muenchen: [
    { area: 'Altstadt', lat: 48.137, lng: 11.575 },
    { area: 'Schwabing', lat: 48.167, lng: 11.586 },
    { area: 'Maxvorstadt', lat: 48.151, lng: 11.564 }
  ],
  warszawa: [
    { area: 'Centrum', lat: 52.229, lng: 21.012 },
    { area: 'Mokotow', lat: 52.193, lng: 21.034 },
    { area: 'Wola', lat: 52.237, lng: 20.958 }
  ]
};

type AuthUser = {
  id: string;
  email?: string;
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

if (NODE_ENV === 'production' && !ALLOW_TEST_SEED) {
  throw new Error('Refusing to seed test accounts in production unless ALLOW_TEST_SEED=true is set.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const targetEmails = Array.from({ length: 3 }, (_, index) => `qa+test${index + 1}@example.test`);
  console.log('Escort Radar test account seed');
  console.log(`Environment: NODE_ENV=${NODE_ENV}, ALLOW_TEST_SEED=${ALLOW_TEST_SEED}`);
  console.log(`Will deactivate old test profiles where email contains "+test" or is_test_account=true.`);
  console.log(`Will create/update ${targetEmails.length} test auth users and create ${targetEmails.length} fresh active test profiles.`);
  console.log(`Protected admin emails: ${Array.from(adminEmails).join(', ')}`);

  const users = await listAllUsers();
  const testUsers = users.filter((user) => isSafeTestEmail(user.email));
  const testUserIds = testUsers.map((user) => user.id);

  await deactivateOldTestProfiles(testUserIds);

  for (let index = 0; index < targetEmails.length; index += 1) {
    const email = targetEmails[index];
    const user = await createOrUpdateUser(email, users);
    await createProfileForUser(user.id, email, index);
    console.log(`Created test profile ${index + 1}/${targetEmails.length} for ${email}`);
  }

  console.log('Done. Test accounts are ready for live QA.');
}

async function listAllUsers() {
  const users: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function deactivateOldTestProfiles(testUserIds: string[]) {
  const inactivePatch = {
    status: 'suspended',
    moderation_status: 'rejected',
    availability_status: 'unavailable',
    is_test_account: true,
    admin_note: 'Old test profile deactivated before fresh live QA seed'
  };

  const { error: flagError } = await supabase
    .from('profiles')
    .update(inactivePatch)
    .eq('is_test_account', true);

  if (flagError) throw flagError;

  if (testUserIds.length) {
    const { error: userError } = await supabase
      .from('profiles')
      .update(inactivePatch)
      .in('user_id', testUserIds);

    if (userError) throw userError;
  }
}

async function createOrUpdateUser(email: string, knownUsers: AuthUser[]) {
  if (!isSafeTestEmail(email)) {
    throw new Error(`Refusing to create non-test email: ${email}`);
  }

  const existing = knownUsers.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true
    } as Parameters<typeof supabase.auth.admin.updateUserById>[1]);
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) throw error;
  return data.user;
}

async function createProfileForUser(userId: string, email: string, index: number) {
  const city = cities[index % cities.length];
  const areaData = cityAreas[city][index % cityAreas[city].length];
  const category = categories[index % categories.length];
  const availabilityStatus = statuses[index % statuses.length];
  const radius = radiuses[index % radiuses.length];
  const displayNumber = index + 1;

  const profile = {
    user_id: userId,
    display_name: `Escort Radar Test ${displayNumber}`,
    slug: `escort-radar-test-${displayNumber}-${runId}`,
    city,
    area: areaData.area,
    category,
    description: 'Safe test profile for Escort Radar MVP QA. Demo-Inhalt fuer technische Tests. Profil testowy do bezpiecznych testow online.',
    languages: ['DE', 'EN', 'PL'],
    available_now: availabilityStatus === 'available',
    mobile_service: index % 2 === 0,
    private_studio: index % 3 === 0,
    verified: true,
    status: 'active',
    verification_status: 'verified',
    moderation_status: 'approved',
    subscription_status: 'active',
    listing_plan: 'premium_monthly',
    listing_price: 49.99,
    listing_currency: 'EUR',
    max_photos: 6,
    is_test_account: true,
    availability_status: availabilityStatus,
    service_radius_km: radius,
    approximate_location_area: areaData.area,
    latitude: offsetCoordinate(areaData.lat, index),
    longitude: offsetCoordinate(areaData.lng, index + 3),
    age: 25 + (index % 12),
    height: 165 + (index % 22),
    orientation: index % 2 === 0 ? 'straight' : 'queer-friendly',
    audience: index % 3 === 0 ? ['men', 'couples'] : ['men'],
    visit_types: index % 2 === 0 ? ['incall', 'hotel'] : ['outcall', 'hotel'],
    service_tags: ['conversation', 'events', 'discreet'],
    payment_methods: ['cash'],
    price_30min: 120 + (index % 5) * 10,
    price_1h: 200 + (index % 6) * 20,
    price_2h: 360 + (index % 5) * 30,
    price_night: 900 + (index % 5) * 80,
    outcall_fee: 50 + (index % 4) * 10,
    currency: 'EUR',
    service_menu: [
      { name: 'conversation', enabled: true, included: true, extra_price: null, note: 'Safe QA item' },
      { name: 'events', enabled: true, included: false, extra_price: 80, note: 'Test add-on' },
      { name: 'discreet', enabled: true, included: true, extra_price: null, note: 'Privacy test' }
    ],
    admin_note: `Test account generated for live QA (${email})`,
    verified_at: new Date().toISOString()
  };

  const { error } = await supabase.from('profiles').insert(profile);
  if (error) throw error;
}

function isSafeTestEmail(email: string | undefined) {
  const normalized = email?.toLowerCase() || '';
  return normalized.includes('+test') && !adminEmails.has(normalized);
}

function offsetCoordinate(value: number, seed: number) {
  return Math.round((value + ((seed % 7) - 3) * 0.006) * 1000000) / 1000000;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
