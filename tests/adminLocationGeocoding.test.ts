import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  AdminLocationGeocodingError,
  adminAddressOrPrivacyChanged,
  adminLocationChanged,
  buildAdminLocationPatch,
  resetAdminLocationGeocodingStateForTests,
  resolveAdminLocation,
  resolveManualAdminLocationForSave,
  reverseGeocodeAdminLocation,
  validateManualAdminLocation
} from '../Back/src/adminLocationGeocoding.js';
import { resolveEffectivePublicLocation } from '../Back/src/publicLocation.js';
import { adminLocationFormFromProfile, adminLocationSavePayload, mergeAdminReverseGeocode } from '../Front/src/lib/adminLocationForm.js';

const berlinA = {
  work_country: 'DE',
  work_city: 'Berlin',
  work_area: 'Mitte',
  postal_code: '10115',
  exact_address: 'Invalidenstrasse 1',
  work_place_label: 'Invalidenstrasse 1',
  city: 'berlin',
  area: 'Mitte',
  latitude: 52.53,
  longitude: 13.38,
  location_mode: 'approximate',
  location_visibility: 'exact'
};

test('changing a street uses structured Nominatim search and replaces old coordinates', async () => {
  resetAdminLocationGeocodingStateForTests();
  const berlinB = { ...berlinA, exact_address: 'Warschauer Strasse 10, Berlin', work_place_label: 'Warschauer Strasse 10' };
  assert.equal(adminLocationChanged(berlinA, berlinB), true);
  assert.equal(adminAddressOrPrivacyChanged(berlinA, berlinB), true);
  let requestedUrl = '';
  let requestedUserAgent = '';
  let requestedAccept = '';

  const location = await resolveAdminLocation(berlinB, {
    rateLimitMs: 0,
    userAgent: 'Escort Radar tests (+https://escort-radar.fun)',
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedUserAgent = new Headers(init?.headers).get('User-Agent') || '';
      requestedAccept = new Headers(init?.headers).get('Accept') || '';
      return mockNominatimResponse([
        nominatimResult({ latitude: 52.505, longitude: 13.449, country: 'de', houseNumber: '10' })
      ]);
    }
  });

  const query = new URL(requestedUrl);
  assert.equal(query.origin + query.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(query.searchParams.get('street'), 'Warschauer Strasse 10');
  assert.equal(query.searchParams.get('city'), 'Berlin');
  assert.equal(query.searchParams.get('postalcode'), '10115');
  assert.equal(query.searchParams.get('country'), 'Germany');
  assert.equal(query.searchParams.get('countrycodes'), 'de');
  assert.equal(query.searchParams.get('format'), 'jsonv2');
  assert.equal(query.searchParams.get('addressdetails'), '1');
  assert.equal(query.searchParams.get('limit'), '5');
  assert.match(requestedUserAgent, /Escort Radar.*escort-radar\.fun/);
  assert.equal(requestedAccept, 'application/json');
  assert.deepEqual(
    { latitude: location.latitude, longitude: location.longitude, precision: location.precision, geocoded: location.geocoded },
    { latitude: 52.505, longitude: 13.449, precision: 'exact', geocoded: true }
  );
});

test('Nominatim prefers the matching house number and marks a street-only fallback approximate', async () => {
  resetAdminLocationGeocodingStateForTests();
  const exact = await resolveAdminLocation({ ...berlinA, exact_address: 'Example Street 12' }, {
    rateLimitMs: 0,
    fetchImpl: async () => mockNominatimResponse([
      nominatimResult({ latitude: 52.51, longitude: 13.41, country: 'de' }),
      nominatimResult({ latitude: 52.52, longitude: 13.42, country: 'de', houseNumber: '12' })
    ])
  });
  assert.equal(exact.latitude, 52.52);
  assert.equal(exact.precision, 'exact');

  resetAdminLocationGeocodingStateForTests();
  const street = await resolveAdminLocation({ ...berlinA, exact_address: 'Example Street 99' }, {
    rateLimitMs: 0,
    fetchImpl: async () => mockNominatimResponse([
      nominatimResult({ latitude: 52.51, longitude: 13.41, country: 'de', road: 'Example Street' })
    ])
  });
  assert.equal(street.precision, 'street');
  assert.equal(street.latitude, 52.51);
});

test('postal_area omits the street and requests only the safe structured area', async () => {
  resetAdminLocationGeocodingStateForTests();
  let requestedUrl = '';
  const location = await resolveAdminLocation({ ...berlinA, location_visibility: 'postal_area' }, {
    rateLimitMs: 0,
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return mockNominatimResponse([nominatimResult({ latitude: 52.532, longitude: 13.384, country: 'de' })]);
    }
  });
  const query = new URL(requestedUrl);
  assert.equal(location.precision, 'postal_area');
  assert.equal(query.searchParams.has('street'), false);
  assert.equal(query.searchParams.get('postalcode'), '10115');
  assert.equal(query.searchParams.get('city'), 'Berlin');
});

test('manual exact point takes priority and performs no external request', async () => {
  resetAdminLocationGeocodingStateForTests();
  let requests = 0;
  const location = await resolveAdminLocation({
    ...berlinA,
    exact_address: 'New text that must not trigger Nominatim',
    latitude: 52.5001,
    longitude: 13.4002,
    location_input_source: 'manual'
  }, {
    rateLimitMs: 0,
    fetchImpl: async () => {
      requests += 1;
      throw new Error('must not run');
    }
  });
  assert.equal(requests, 0);
  assert.deepEqual(location, {
    latitude: 52.5001,
    longitude: 13.4002,
    geocoded: false,
    precision: 'exact'
  });
});

test('reverse geocoding preserves the clicked point and normalizes all returned address parts without inventing a house number', async () => {
  resetAdminLocationGeocodingStateForTests();
  let requestedUrl = '';
  const location = await reverseGeocodeAdminLocation(52.521234, 13.412345, {
    rateLimitMs: 0,
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        lat: '52.52',
        lon: '13.41',
        display_name: 'Donaustraße, Neukölln, 12043 Berlin, Deutschland',
        address: {
          country_code: 'de', country: 'Deutschland', city: 'Berlin', suburb: 'Neukölln',
          postcode: '12043', road: 'Donaustraße'
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const query = new URL(requestedUrl);
  assert.equal(query.pathname, '/reverse');
  assert.equal(query.searchParams.get('lat'), '52.521234');
  assert.equal(query.searchParams.get('lon'), '13.412345');
  assert.equal(location.latitude, 52.521234, 'reverse result must not move the marker to a geocoder centroid');
  assert.equal(location.longitude, 13.412345);
  assert.equal(location.work_country, 'DE');
  assert.equal(location.work_city, 'Berlin');
  assert.equal(location.work_area, 'Neukölln');
  assert.equal(location.postal_code, '12043');
  assert.equal(location.street, 'Donaustraße');
  assert.equal(location.house_number, undefined);
  assert.doesNotMatch(location.exact_address || '', /\b\d+[a-z]?\b.*Donaustraße/i);
});

test('reverse geocoding accepts Google-style Berlin address component aliases', async () => {
  resetAdminLocationGeocodingStateForTests();
  const location = await reverseGeocodeAdminLocation(52.5071, 13.4352, {
    rateLimitMs: 0,
    fetchImpl: async () => new Response(JSON.stringify({
      display_name: 'Warschauer Strasse 10, 10243 Berlin, Germany',
      address: {
        countryCode: 'DE',
        country: 'Germany',
        locality: 'Berlin',
        sublocality_level_1: 'Friedrichshain',
        postal_code: '10243',
        route: 'Warschauer Strasse',
        street_number: '10'
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  assert.deepEqual({
    country: location.work_country,
    city: location.work_city,
    district: location.work_area,
    postalCode: location.postal_code,
    street: location.street,
    houseNumber: location.house_number
  }, {
    country: 'DE', city: 'Berlin', district: 'Friedrichshain', postalCode: '10243',
    street: 'Warschauer Strasse', houseNumber: '10'
  });
});

test('manual save keeps the selected coordinates and enriches address data when reverse geocoding succeeds', async () => {
  resetAdminLocationGeocodingStateForTests();
  const point = { ...berlinA, latitude: 52.507123, longitude: 13.435299, location_input_source: 'manual' };
  const location = await resolveManualAdminLocationForSave(point, {
    rateLimitMs: 0,
    fetchImpl: async () => new Response(JSON.stringify({
      display_name: 'Warschauer Strasse 10, Berlin',
      address: { country_code: 'de', country: 'Germany', city: 'Berlin', suburb: 'Friedrichshain', postcode: '10243', road: 'Warschauer Strasse', house_number: '10' }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const patch = buildAdminLocationPatch(location, 'manual');
  assert.equal(location.geocoded, true);
  assert.equal(patch.latitude, point.latitude);
  assert.equal(patch.longitude, point.longitude);
  assert.equal(patch.location_precision, 'exact');
  assert.equal(patch.location_input_source, 'manual');
  assert.equal(patch.work_city, 'Berlin');
  assert.equal(patch.postal_code, '10243');
});

test('manual save falls back to exact coordinates for timeout, 429, 5xx and no reverse result without clearing address fields', async () => {
  const failures: Array<[string, () => Promise<Response>]> = [
    ['timeout', async () => { throw new DOMException('timed out', 'TimeoutError'); }],
    ['429', async () => new Response('rate limited', { status: 429 })],
    ['5xx', async () => new Response('upstream down', { status: 503 })],
    ['no result', async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } })]
  ];
  for (const [name, fetchImpl] of failures) {
    resetAdminLocationGeocodingStateForTests();
    const profile = {
      ...berlinA,
      latitude: 52.501234,
      longitude: 13.401234,
      location_input_source: 'manual'
    };
    const location = await resolveManualAdminLocationForSave(profile, { rateLimitMs: 0, fetchImpl });
    const saved = { ...profile, ...buildAdminLocationPatch(location, 'manual') };
    assert.equal(saved.latitude, profile.latitude, name);
    assert.equal(saved.longitude, profile.longitude, name);
    assert.equal(saved.location_precision, 'exact', name);
    assert.ok(location.geocoding_warning, name);
    assert.equal(saved.work_city, 'Berlin', name);
    assert.equal(saved.postal_code, '10115', name);
    assert.equal(saved.exact_address, 'Invalidenstrasse 1', name);
  }
});

test('forward geocoding distinguishes validation misses from provider failures', async () => {
  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveAdminLocation(berlinA, { rateLimitMs: 0, fetchImpl: async () => mockNominatimResponse([]) }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'address_not_found' && error.status === 422
  );
  for (const [status, expectedStatus] of [[429, 503], [500, 503], [403, 502]] as const) {
    resetAdminLocationGeocodingStateForTests();
    await assert.rejects(
      resolveAdminLocation(berlinA, { rateLimitMs: 0, fetchImpl: async () => new Response('failed', { status }) }),
      (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'geocoder_http_error' && error.status === expectedStatus
    );
  }
  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveAdminLocation(berlinA, { rateLimitMs: 0, fetchImpl: async () => { throw new Error('network down'); } }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'geocoder_unavailable' && error.status === 503
  );
});

test('manual point accepts finite boundary-range coordinates and rejects values outside the ranges', () => {
  assert.deepEqual(validateManualAdminLocation({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0, geocoded: false, precision: 'exact' });
  assert.throws(
    () => validateManualAdminLocation({ latitude: null, longitude: null }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'invalid_manual_coordinates'
  );
  assert.throws(
    () => validateManualAdminLocation({ latitude: 90.0001, longitude: 13 }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'invalid_manual_coordinates' && error.status === 422
  );
  assert.throws(
    () => validateManualAdminLocation({ latitude: 52, longitude: -180.0001 }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'invalid_manual_coordinates'
  );
});

test('manual save blocks only a confirmed reverse-geocoder country mismatch', async () => {
  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveManualAdminLocationForSave({ ...berlinA, location_input_source: 'manual' }, {
      rateLimitMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({
        address: { country_code: 'us', country: 'United States', city: 'New York' }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'geocoder_country_mismatch' && error.status === 422
  );
});

test('dragend point remains exact through reverse geocoding, save payload and profile reload', () => {
  const point = { latitude: 52.507123456789, longitude: 13.435298765432 };
  const location = {
    latitude: 52.5,
    longitude: 13.4,
    work_country: 'DE',
    work_city: 'Berlin',
    work_area: 'Friedrichshain',
    postal_code: '10243',
    street: 'Warschauer Strasse',
    house_number: '10',
    exact_address: 'Warschauer Strasse 10, 10243 Berlin, Germany',
    work_place_label: 'Warschauer Strasse 10, Friedrichshain, Berlin',
    geocoded: false,
    precision: 'exact' as const
  };
  const form = mergeAdminReverseGeocode({}, point, location, () => 'berlin');
  const payload = adminLocationSavePayload(form);
  assert.deepEqual(payload, {
    latitude: point.latitude,
    longitude: point.longitude,
    work_country: 'DE',
    work_city: 'Berlin',
    work_area: 'Friedrichshain',
    area: 'Friedrichshain',
    postal_code: '10243',
    exact_address: 'Warschauer Strasse 10, 10243 Berlin, Germany',
    work_place_label: 'Warschauer Strasse 10, Friedrichshain, Berlin',
    location_mode: 'approximate',
    location_visibility: 'exact',
    location_precision: 'exact',
    location_input_source: 'manual'
  });

  const reloaded = adminLocationFormFromProfile({
    id: 'saved', display_name: 'Saved', available_now: false, mobile_service: false,
    private_studio: false, verified: true, premium: false, profile_images: [],
    ...payload
  });
  assert.equal(reloaded.latitude, String(point.latitude));
  assert.equal(reloaded.longitude, String(point.longitude));
  assert.equal(reloaded.work_area, 'Friedrichshain');
  assert.equal(reloaded.postal_code, '10243');
  assert.match(reloaded.exact_address, /Warschauer Strasse 10/);
});

test('partial reverse-geocoder data never clears existing admin address fields', () => {
  const current = {
    work_country: 'DE', work_city: 'Berlin', city: 'berlin', work_area: 'Mitte', area: 'Mitte',
    postal_code: '10115', exact_address: 'Invalidenstrasse 1', work_place_label: 'Invalidenstrasse 1, Berlin'
  };
  const merged = mergeAdminReverseGeocode(current, { latitude: 52.53, longitude: 13.38 }, {
    latitude: 52.53, longitude: 13.38, work_country: 'DE', work_city: 'Berlin', precision: 'city', geocoded: true
  }, () => 'berlin');
  assert.equal(merged.work_area, 'Mitte');
  assert.equal(merged.area, 'Mitte');
  assert.equal(merged.postal_code, '10115');
  assert.equal(merged.exact_address, 'Invalidenstrasse 1');
  assert.equal(merged.work_place_label, 'Invalidenstrasse 1, Berlin');
});

test('nearby reverse-geocode points do not share coordinates through a rounded cache key', async () => {
  resetAdminLocationGeocodingStateForTests();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return new Response(JSON.stringify({
      address: { country_code: 'de', country: 'Germany', city: 'Berlin', road: 'Testweg' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const first = await reverseGeocodeAdminLocation(52.5000001, 13.4000001, { rateLimitMs: 0, fetchImpl });
  const second = await reverseGeocodeAdminLocation(52.5000002, 13.4000002, { rateLimitMs: 0, fetchImpl });
  assert.equal(requests, 2);
  assert.deepEqual([first.latitude, first.longitude], [52.5000001, 13.4000001]);
  assert.deepEqual([second.latitude, second.longitude], [52.5000002, 13.4000002]);
});

test('one backend queue serializes Nominatim calls, respects the gap and caches normalized addresses', async () => {
  resetAdminLocationGeocodingStateForTests();
  let active = 0;
  let maxActive = 0;
  let requests = 0;
  const starts: number[] = [];
  const fetchImpl = async () => {
    requests += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    starts.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return mockNominatimResponse([nominatimResult({ latitude: 52.5 + requests / 100, longitude: 13.4, country: 'de' })]);
  };
  const firstProfile = { ...berlinA, exact_address: 'Queue Street 1' };
  const secondProfile = { ...berlinA, exact_address: 'Queue Street 2' };
  await Promise.all([
    resolveAdminLocation(firstProfile, { fetchImpl, rateLimitMs: 30 }),
    resolveAdminLocation(secondProfile, { fetchImpl, rateLimitMs: 30 })
  ]);
  assert.equal(maxActive, 1);
  assert.ok(starts[1] - starts[0] >= 25);
  await resolveAdminLocation({ ...firstProfile, exact_address: '  queue   street 1 ' }, { fetchImpl, rateLimitMs: 30 });
  assert.equal(requests, 2);
});

test('city_only keeps deterministic city fallback and hidden stays off the map', async () => {
  resetAdminLocationGeocodingStateForTests();
  const location = await resolveAdminLocation({
    ...berlinA,
    latitude: 48.1,
    longitude: 11.5,
    location_mode: 'city_only',
    location_visibility: 'city_only'
  });
  assert.deepEqual(location, { latitude: 52.52, longitude: 13.405, geocoded: false, precision: 'city' });
  const publicLocation = resolveEffectivePublicLocation({
    ...berlinA,
    latitude: location.latitude,
    longitude: location.longitude,
    location_mode: 'city_only',
    location_visibility: 'city_only'
  }, 0);
  assert.equal(publicLocation?.location_precision, 'city');
  assert.equal(resolveEffectivePublicLocation({ ...berlinA, location_visibility: 'hidden' }), null);
});

test('wrong country, invalid coordinates and no forward result return errors without a fallback', async () => {
  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveAdminLocation(berlinA, {
      rateLimitMs: 0,
      fetchImpl: async () => mockNominatimResponse([nominatimResult({ latitude: 40.7, longitude: -74, country: 'us' })])
    }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'geocoder_country_mismatch'
  );

  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveAdminLocation(berlinA, {
      rateLimitMs: 0,
      fetchImpl: async () => mockNominatimResponse([nominatimResult({ latitude: 91, longitude: 181, country: 'de' })])
    }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'invalid_geocoder_coordinates'
  );

  resetAdminLocationGeocodingStateForTests();
  await assert.rejects(
    resolveAdminLocation(berlinA, { rateLimitMs: 0, fetchImpl: async () => mockNominatimResponse([]) }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'address_not_found'
  );
  assert.throws(
    () => validateManualAdminLocation({ latitude: 91, longitude: 181 }),
    (error: unknown) => error instanceof AdminLocationGeocodingError && error.code === 'invalid_manual_coordinates'
  );
});

test('admin route resolves manual coordinates before update, keeps validation status mapping and preserves sponsorship provenance', async () => {
  const [source, resolverSource] = await Promise.all([
    readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/adminLocationGeocoding.ts', import.meta.url), 'utf8')
  ]);
  const updateRoute = source.slice(source.indexOf("put('/profiles/:id'"), source.indexOf("patch('/profiles/:id/publish"));
  assert.ok(updateRoute.indexOf('resolveAdminLocation(') < updateRoute.indexOf(".from('profiles')\n    .update(patch)"));
  assert.match(updateRoute, /AdminLocationGeocodingError.*status\(error\.status\)/s);
  assert.match(updateRoute, /delete \(patch as Record<string, unknown>\)\[key\]/);
  assert.match(updateRoute, /'is_sponsored'.*'acquisition_source'.*'provider'/s);
  assert.match(updateRoute, /location_updated_at/);
  assert.match(updateRoute, /location_input_source === 'manual'/);
  assert.match(updateRoute, /manualExactPoint[\s\S]*await resolveManualAdminLocationForSave/);
  assert.ok(updateRoute.indexOf('await resolveManualAdminLocationForSave') < updateRoute.indexOf(".from('profiles')\n    .update(patch)"));
  assert.match(updateRoute, /buildAdminLocationPatch\(locationResolution/);
  assert.match(updateRoute, /location_geocoding_warning/);
  assert.match(resolverSource, /location_mode: precision === 'city' \? 'city_only' : 'approximate'/);
});

test('Admin flow contains no Google geocoder or Google map and public API stays private', async () => {
  const [routeSource, resolverSource, adminPageSource, workPointMapSource, publicRouteSource] = await Promise.all([
    readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/adminLocationGeocoding.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/WorkPointMap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8')
  ]);
  for (const source of [routeSource, resolverSource, adminPageSource, workPointMapSource]) {
    assert.doesNotMatch(source, /GOOGLE_MAPS_API_KEY|maps\.googleapis|google\.maps/i);
  }
  assert.match(resolverSource, /nominatim\.openstreetmap\.org\/search/);
  assert.match(resolverSource, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(adminPageSource, /reverseAdminLocation/);
  assert.match(adminPageSource, /requestId !== studioLocationRequestRef\.current/);
  assert.doesNotMatch(workPointMapSource, /toFixed\(6\)/);
  assert.match(workPointMapSource, /marker\.on\('dragend'/);
  assert.doesNotMatch(workPointMapSource, /marker\.on\('drag'/);
  assert.ok(routeSource.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)') < routeSource.indexOf("adminRouter.post('/location/reverse-geocode'"));
  assert.match(workPointMapSource, /maplibre-gl/);
  assert.match(publicRouteSource, /exact_address: _exactAddress/);
});

function nominatimResult(input: { latitude: number; longitude: number; country: string; houseNumber?: string; road?: string }) {
  return {
    lat: String(input.latitude),
    lon: String(input.longitude),
    display_name: 'Resolved OpenStreetMap location',
    address: {
      country_code: input.country,
      house_number: input.houseNumber,
      road: input.road || 'Test Street',
      city: 'Berlin',
      postcode: '10115'
    }
  };
}

function mockNominatimResponse(results: unknown[]) {
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
