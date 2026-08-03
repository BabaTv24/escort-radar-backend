import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  profileLocationPrivacyPatch,
  profileLocationSavePayload
} from '../Front/src/lib/adminLocationForm.ts';

const componentUrl = new URL('../Front/src/components/advertiser-dashboard/AdvertiserLocationSection.tsx', import.meta.url);
const dashboardUrl = new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url);
const localeUrls = {
  pl: new URL('../Front/src/locales/pl.json', import.meta.url),
  de: new URL('../Front/src/locales/de.json', import.meta.url),
  en: new URL('../Front/src/locales/en.json', import.meta.url)
};

async function loadFixture() {
  const [source, dashboardSource, pl, de, en] = await Promise.all([
    readFile(componentUrl, 'utf8'),
    readFile(dashboardUrl, 'utf8'),
    readFile(localeUrls.pl, 'utf8').then(JSON.parse),
    readFile(localeUrls.de, 'utf8').then(JSON.parse),
    readFile(localeUrls.en, 'utf8').then(JSON.parse)
  ]);
  return { source, dashboardSource, locales: { pl, de, en } as Record<string, Record<string, string>> };
}

test('advertiser location section uses i18n and German UI contains no Polish labels', async () => {
  const { source, dashboardSource, locales } = await loadFixture();
  const polishLabels = [
    'Kraj', 'Miasto', 'Kod pocztowy', 'Ulica i numer', 'Dzielnica / rejon',
    'Zapisz lokalizację', 'Użyj mojej lokalizacji', 'Zakres widoczności'
  ];

  assert.match(source, /const \{ lang, t \} = useI18n\(\)/);
  assert.match(source, /item\.labels\[lang\]/);
  assert.doesNotMatch(dashboardSource, /Rozpoznawanie adresu|Adres rozpoznany|Nie udało się rozpoznać adresu/);
  assert.match(dashboardSource, /setLocationError\(t\('advertiserDashboard\.location\.reverseFailed'\)\)/);
  for (const label of polishLabels) {
    assert.doesNotMatch(source, new RegExp(`['\"]${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.ok(!Object.values(locales.de).includes(label), `German locale must not expose Polish label: ${label}`);
  }

  assert.equal(locales.de['advertiserDashboard.location.country'], 'Land');
  assert.equal(locales.de['advertiserDashboard.location.city'], 'Stadt');
  assert.equal(locales.de['advertiserDashboard.location.postalCode'], 'Postleitzahl');
  assert.equal(locales.de['advertiserDashboard.location.streetAddress'], 'Straße und Hausnummer');
  assert.equal(locales.de['advertiserDashboard.location.visibilityRange'], 'Sichtbarkeit');
  assert.equal(locales.de['dashboard.advertiser.saveLocation'], 'Standort speichern');
});

test('every advertiser location translation key exists in PL DE and EN', async () => {
  const { source, locales } = await loadFixture();
  const staticKeys = [...source.matchAll(/t\('([^']+)'/g)].map((match) => match[1]);
  const dynamicKeys = ['exact', 'postal_area', 'city_only', 'hidden'].flatMap((value) => [
    `advertiserDashboard.location.privacy.${value}.title`,
    `advertiserDashboard.location.privacy.${value}.description`,
    `advertiserDashboard.location.preview.${value}`
  ]);
  const keys = [...new Set([...staticKeys, ...dynamicKeys])];

  for (const language of ['pl', 'de', 'en']) {
    for (const key of keys) {
      assert.equal(typeof locales[language][key], 'string', `${language}:${key}`);
      assert.ok(locales[language][key].trim(), `${language}:${key} must not be empty`);
    }
  }
});

test('language-independent location values and save payload remain unchanged', async () => {
  assert.deepEqual(profileLocationPrivacyPatch('exact'), {
    location_visibility: 'exact', location_mode: 'approximate', location_precision: 'exact'
  });
  assert.deepEqual(profileLocationPrivacyPatch('postal_area'), {
    location_visibility: 'postal_area', location_mode: 'approximate', location_precision: 'postal_area'
  });
  assert.deepEqual(profileLocationPrivacyPatch('city_only'), {
    location_visibility: 'city_only', location_mode: 'city_only', location_precision: 'city'
  });
  assert.deepEqual(profileLocationPrivacyPatch('hidden'), {
    location_visibility: 'hidden', location_mode: 'exact_hidden'
  });

  const payload = profileLocationSavePayload({
    latitude: '52.5200', longitude: '13.4050', work_country: ' DE ', work_city: ' Berlin ',
    work_area: ' Mitte ', area: ' Mitte ', postal_code: ' 10115 ', exact_address: ' Invalidenstraße 1 ',
    work_place_label: ' Studio ', location_mode: 'approximate', location_visibility: 'exact',
    location_precision: 'exact', location_input_source: 'manual'
  });
  assert.deepEqual(payload, {
    latitude: 52.52, longitude: 13.405, work_country: 'DE', work_city: 'Berlin', work_area: 'Mitte',
    area: 'Mitte', postal_code: '10115', exact_address: 'Invalidenstraße 1', work_place_label: 'Studio',
    location_mode: 'approximate', location_visibility: 'exact', location_precision: 'exact',
    location_input_source: 'manual'
  });

  const { source } = await loadFixture();
  assert.match(source, /const payload = profileLocationSavePayload\(currentProfile\.current\)/);
  assert.match(source, /onSaveLocation\(\{ \.\.\.currentProfile\.current, \.\.\.payload \}/);
});

test('backend error messages are not rendered directly in advertiser location UI', async () => {
  const { source } = await loadFixture();
  assert.match(source, /function friendlyErrorMessage\(_error: unknown, fallback: string\) \{\s*return fallback;/);
  assert.doesNotMatch(source, /error\.message|saveError\.message|searchError\.message/);
});
