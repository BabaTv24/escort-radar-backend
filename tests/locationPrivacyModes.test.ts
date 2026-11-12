import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEffectivePublicLocation } from '../Back/src/publicLocation';

const point = { latitude: 52.5163, longitude: 13.3889 };
const base = { id: 'privacy', work_city: 'Berlin', city: 'berlin', ...point };

test('exact_hidden publishes no coordinates', () => {
  assert.equal(resolveEffectivePublicLocation({ ...base, location_mode: 'exact_hidden', location_visibility: 'hidden' }), null);
});

test('intentionally public exact location keeps the admin point', () => {
  const location = resolveEffectivePublicLocation({ ...base, location_mode: 'approximate', location_visibility: 'exact', location_precision: 'exact' });
  assert.deepEqual({ latitude: location!.latitude, longitude: location!.longitude }, point);
  assert.equal(location!.location_approximate, false);
});

test('city_only never publishes the stored point', () => {
  const location = resolveEffectivePublicLocation({ ...base, location_mode: 'city_only', location_visibility: 'city_only', location_precision: 'exact' });
  assert.ok(location);
  assert.notDeepEqual({ latitude: location!.latitude, longitude: location!.longitude }, point);
  assert.equal(location!.location_precision, 'city');
});

test('approximate (postal_area) with a postal-level point keeps that point', () => {
  const location = resolveEffectivePublicLocation({ ...base, location_mode: 'approximate', location_visibility: 'postal_area', location_precision: 'postal_area' });
  assert.deepEqual({ latitude: location!.latitude, longitude: location!.longitude }, point);
  assert.equal(location!.location_approximate, true);
});

test('approximate (postal_area) never exposes a stored address-precision point', () => {
  for (const precision of ['exact', 'street']) {
    const location = resolveEffectivePublicLocation({ ...base, location_mode: 'exact', location_visibility: 'postal_area', location_precision: precision, postal_code: '10117' });
    assert.ok(location, precision);
    assert.notDeepEqual({ latitude: location!.latitude, longitude: location!.longitude }, point, precision);
    assert.equal(location!.location_approximate, true);
    assert.equal(location!.location_precision, 'city');
  }
});

test('radar listing selects location_precision so the postal_area guard also applies to Radar', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const radarSelect = source.slice(source.indexOf('const radarSelect'), source.indexOf("].join(', ')"));
  assert.match(radarSelect, /'location_precision'/);
});
