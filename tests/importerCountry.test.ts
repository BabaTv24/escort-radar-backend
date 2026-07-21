import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { extractImportedProfileCountry, resolveImportedCountry } from '../Back/src/hermesImport.ts';

test('importer prefers explicit JSON-LD or breadcrumb country and then controlled city fallback', () => {
  const jsonLd = `<script type="application/ld+json">{"address":{"addressLocality":"Prag","addressCountry":"CZ"}}</script>`;
  assert.equal(extractImportedProfileCountry(jsonLd), 'CZ');
  assert.equal(extractImportedProfileCountry('<nav class="breadcrumb"><a>Deutschland</a><a>Bonn</a></nav>'), 'DE');
  assert.equal(resolveImportedCountry('PL', 'Bonn'), 'PL');
  assert.equal(resolveImportedCountry('', 'Bonn'), 'DE');
  for (const city of ['Prag', 'Praga', 'Praha', 'Prague']) assert.equal(resolveImportedCountry('', city), 'CZ');
});

test('importer does not derive country from the escort.club language subdomain', async () => {
  const route = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const preview = route.slice(route.indexOf('function normalizeHermesPreviewProfile'), route.indexOf('function normalizeHermesCity'));
  assert.match(preview, /resolveImportedCountry\(rawProfile\.country \|\| rawProfile\.work_country, cityLabel\)/);
  assert.doesNotMatch(preview, /hostname|startsWith\('de\.'\)/);
});

test('importer prevents DE from being stored for controlled Polish city variants', () => {
  for (const city of ['Bydgoszcz', 'Kołobrzeg', 'Kolobrzeg', 'Koszalin', 'Stargard', 'Stargard Szczeciński', 'Stargard Szczecinski', 'Szczecin', 'Poznań', 'Poznan']) {
    assert.equal(resolveImportedCountry('DE', city), 'PL', city);
  }
  assert.equal(resolveImportedCountry('DE', 'Bonn'), 'DE');
  assert.equal(resolveImportedCountry('', 'Prag'), 'CZ');
  assert.equal(resolveImportedCountry('', 'Praha'), 'CZ');
});
