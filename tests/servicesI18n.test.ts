import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canonicalServiceKey,
  localizedServiceLabel,
  normalizeServiceSearch,
  serviceLabel,
  serviceOptions
} from '../Front/src/data/serviceCatalog.ts';

type Dict = Record<string, string>;
const langs = ['pl', 'de', 'en'] as const;

async function loadLocales() {
  const entries = await Promise.all(langs.map(async (lang) => [
    lang,
    JSON.parse(await readFile(new URL(`../Front/src/locales/${lang}.json`, import.meta.url), 'utf8')) as Dict
  ] as const));
  return Object.fromEntries(entries) as Record<(typeof langs)[number], Dict>;
}

// Mirrors i18n.tsx: active language, then German fallback, then the key itself.
const translator = (locales: Record<string, Dict>, lang: string) => (key: string) => locales[lang][key] || locales.de[key] || key;

test('every predefined service and category has a DE/PL/EN translation without duplicates', async () => {
  const locales = await loadLocales();
  const categories = new Set(serviceOptions.map((service) => service.category));
  for (const lang of langs) {
    const labels = serviceOptions.map((service) => locales[lang][`service.${service.key}`]);
    assert.ok(labels.every((label) => typeof label === 'string' && label.trim()), `${lang}: missing service translation`);
    assert.equal(new Set(labels.map((label) => label.toLowerCase())).size, labels.length, `${lang}: duplicate service labels`);
    for (const category of categories) assert.ok(locales[lang][`serviceCategory.${category}`], `${lang}: missing category ${category}`);
  }
  assert.equal(new Set(serviceOptions.map((service) => service.key)).size, serviceOptions.length, 'service keys stay unique');
});

test('canonical keys and legacy labels stay unchanged and resolve to the same service', () => {
  // Stored canonical values must not change.
  assert.equal(serviceLabel('masaz_tantryczny'), 'Masaz tantryczny');
  assert.equal(canonicalServiceKey('masaz_tantryczny'), 'masaz_tantryczny');
  assert.equal(canonicalServiceKey('towarzystwo'), 'towarzystwo');
  // Previously saved Polish labels map onto their key (no duplicate entries).
  assert.equal(canonicalServiceKey('Masaz tantryczny'), 'masaz_tantryczny');
  assert.equal(canonicalServiceKey('Masaż tantryczny'), 'masaz_tantryczny');
  assert.equal(canonicalServiceKey('Fetysz stóp'), 'fetysz_stop');
  // Custom user text is returned verbatim.
  assert.equal(canonicalServiceKey('Mój własny rytuał'), 'Mój własny rytuał');
});

test('labels follow the active language; custom values are never translated', async () => {
  const locales = await loadLocales();
  const stored = ['towarzystwo', 'masaz_tantryczny', 'Masaz nuru', 'Mój własny rytuał'];
  const snapshot = [...stored];
  assert.deepEqual(stored.map((value) => localizedServiceLabel(value, translator(locales, 'de'))), ['Begleitung', 'Tantramassage', 'Nuru-Massage', 'Mój własny rytuał']);
  assert.deepEqual(stored.map((value) => localizedServiceLabel(value, translator(locales, 'pl'))), ['Towarzystwo', 'Masaż tantryczny', 'Masaż nuru', 'Mój własny rytuał']);
  assert.deepEqual(stored.map((value) => localizedServiceLabel(value, translator(locales, 'en'))), ['Companionship', 'Tantric massage', 'Nuru massage', 'Mój własny rytuał']);
  assert.deepEqual(stored, snapshot, 'rendering labels never mutates stored values');
  // A missing translation falls back to the catalog label rather than the raw i18n key.
  assert.equal(localizedServiceLabel('towarzystwo', (key) => key), 'Towarzystwo');
});

test('service search matches the current language and ignores diacritics', async () => {
  const locales = await loadLocales();
  const search = (lang: string, query: string) => serviceOptions
    .filter((service) => normalizeServiceSearch(localizedServiceLabel(service.key, translator(locales, lang))).includes(normalizeServiceSearch(query)))
    .map((service) => service.key);
  assert.deepEqual(search('de', 'Tantra'), ['masaz_tantryczny']);
  assert.deepEqual(search('en', 'tantric'), ['masaz_tantryczny']);
  assert.deepEqual(search('pl', 'masaz tant'), ['masaz_tantryczny']);
  assert.deepEqual(search('pl', 'masaż tant'), ['masaz_tantryczny']);
  assert.ok(search('de', 'Fußfetisch').includes('fetysz_stop'));
  assert.ok(search('de', 'fussfetisch').includes('fetysz_stop'));
});

test('advertiser editor and public profile render localized service labels', async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
  const [dashboard, profile, card] = await Promise.all([
    read('../Front/src/pages/DashboardPage.tsx'),
    read('../Front/src/pages/ProfilePage.tsx'),
    read('../Front/src/components/ProfileCard.tsx')
  ]);
  for (const source of [dashboard, profile, card]) {
    assert.match(source, /localizedServiceLabel\(/);
    assert.doesNotMatch(source, /\bserviceLabel\(/);
  }
  // Checklist chips render the localized label, never the raw Polish catalog label.
  assert.match(dashboard, /\{localizedServiceLabel\(service\.key, t\)\}/);
  assert.match(dashboard, /selectedServices\.map\(\(key\) => \(\{ key, label: localizedServiceLabel\(key, t\) \}\)\)/);
  // Toggling a legacy value removes every alias and only ever adds the canonical key.
  assert.match(dashboard, /current\.filter\(\(item\) => canonicalServiceKey\(item\) !== key\)/);
  assert.match(dashboard, /selectedServiceKeys\.has\(service\.key\)/);
});
