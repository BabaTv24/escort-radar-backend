import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { selectSitemapProfiles } from '../Back/src/sitemapProfiles.ts';
import {
  fetchPublishedProfiles,
  generateSitemaps,
  profileToSitemapPath,
  renderUrlSet,
  staticPublicPaths,
  writeSitemaps
} from '../scripts/generate-sitemap.ts';

const root = path.resolve(import.meta.dirname, '..');
const front = path.join(root, 'Front');
const indexHtml = readFileSync(path.join(front, 'index.html'), 'utf8');
const homeSource = readFileSync(path.join(front, 'src/pages/HomePage.tsx'), 'utf8');

function pngDimensions(filePath: string) {
  const buffer = readFileSync(filePath);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(filePath: string) {
  const buffer = readFileSync(filePath);
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  throw new Error(`JPEG dimensions not found: ${filePath}`);
}

test('homepage ships the SaaS title, description and an absolute canonical', () => {
  assert.match(indexHtml, /<title>Escort Radar – panel AI do rezerwacji, klientów i lokalnej widoczności<\/title>/);
  assert.match(indexHtml, /content="Zarządzaj rezerwacjami, klientami, wiadomościami i widocznością w mieście z jednego prywatnego panelu wspieranego przez AI\."/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/escort-radar\.fun\/"/);
});

test('Open Graph fields are unique in the initial document', () => {
  for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height']) {
    assert.equal(indexHtml.match(new RegExp(`property="${property}"`, 'g'))?.length, 1, property);
  }
});

test('private and sensitive routes receive noindex,nofollow', () => {
  const routeSeo = readFileSync(path.join(front, 'src/components/RouteSeo.tsx'), 'utf8');
  const seo = readFileSync(path.join(front, 'src/components/Seo.tsx'), 'utf8');
  for (const route of ['/admin', '/dashboard', '/login', '/messages', '/settings', '/auth']) assert.ok(routeSeo.includes(`'${route}'`));
  assert.match(seo, /effectiveNoindex \? 'noindex,nofollow'/);
  assert.match(seo, /\['token', 'claim', 'session'\]/);
});

test('homepage JSON-LD is valid and uses stable Organization and SoftwareApplication ids', () => {
  const scripts = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const json = JSON.parse(scripts[0][1]);
  const graph = json['@graph'];
  assert.equal(graph.find((node: Record<string, string>) => node['@type'] === 'Organization')['@id'], 'https://escort-radar.fun/#organization');
  assert.equal(graph.find((node: Record<string, string>) => node['@type'] === 'SoftwareApplication')['@id'], 'https://escort-radar.fun/#application');
  const application = graph.find((node: Record<string, string>) => node['@type'] === 'SoftwareApplication');
  assert.equal(application.operatingSystem, 'Web');
  assert.doesNotMatch(JSON.stringify(application), /Android|iOS|Windows|macOS/);
});

test('manifest is valid JSON and references only existing local assets', () => {
  const manifest = JSON.parse(readFileSync(path.join(front, 'public/manifest.webmanifest'), 'utf8'));
  const assetUrls = [
    ...manifest.icons.map((icon: { src: string }) => icon.src),
    ...(manifest.screenshots || []).map((item: { src: string }) => item.src),
    ...manifest.shortcuts.flatMap((shortcut: { icons?: Array<{ src: string }> }) => (shortcut.icons || []).map((icon) => icon.src))
  ];
  for (const url of assetUrls) assert.ok(existsSync(path.join(front, 'public', url.replace(/^\//, ''))), url);
  assert.deepEqual(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url), ['/dashboard', '/']);
  assert.equal(manifest.screenshots, undefined);
});

test('robots references sitemap and sitemap excludes private routes', () => {
  const robots = readFileSync(path.join(front, 'public/robots.txt'), 'utf8');
  const sitemap = readFileSync(path.join(front, 'public/sitemap.xml'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/escort-radar\.fun\/sitemap\.xml/);
  assert.doesNotMatch(sitemap, /\/(?:admin|dashboard)(?:\/|&lt;)/);
});

test('sitemap selection excludes unpublished profiles and includes eligible published profiles', () => {
  const base = { status: 'active', moderation_status: 'approved', shadowbanned: false, category: 'ladies' };
  const selected = selectSitemapProfiles([
    { ...base, id: 'published', is_published: true },
    { ...base, id: 'draft', is_published: false },
    { ...base, id: 'disabled-category', is_published: true, category: 'offers' }
  ]);
  assert.deepEqual(selected.map((profile) => profile.id), ['published']);
  const xml = renderUrlSet([...staticPublicPaths.map((pathname) => ({ path: pathname })), ...selected.map((profile) => ({ path: profileToSitemapPath(profile) }))]);
  assert.match(xml, /\/profile\/published/);
  assert.doesNotMatch(xml, /\/profile\/draft/);
});

test('hero has one H1 and an eager, dimensioned product image with descriptive alt text', () => {
  assert.equal(homeSource.match(/<h1[ >]/g)?.length, 1);
  assert.match(homeSource, /alt="Panel AI Escort Radar z radarem lokalnym, wiadomościami, dostępnością i rezerwacjami"/);
  assert.match(homeSource, /width="417"[\s\S]*height="488"[\s\S]*loading="eager"[\s\S]*fetchPriority="high"/);
});

test('hero and Open Graph assets have truthful dimensions and the hero is not the full mockup', () => {
  const hero = path.join(front, 'public/images/escort-radar-ai-client-office.png');
  const mockup = path.join(root, 'Mockup/Klient_Dashbord.png');
  const og = path.join(front, 'public/og/escort-radar-ai-panel-1200x630.jpg');
  assert.deepEqual(pngDimensions(hero), { width: 417, height: 488 });
  assert.deepEqual(jpegDimensions(og), { width: 1200, height: 630 });
  assert.notEqual(createHash('sha256').update(readFileSync(hero)).digest('hex'), createHash('sha256').update(readFileSync(mockup)).digest('hex'));
});

test('runtime SEO uses active-language locales and generic legal pages have stable metadata', () => {
  const seo = readFileSync(path.join(front, 'src/components/Seo.tsx'), 'utf8');
  const routeSeo = readFileSync(path.join(front, 'src/components/RouteSeo.tsx'), 'utf8');
  assert.match(seo, /language === 'de'\) return 'de_DE'/);
  assert.match(seo, /language === 'en'\) return 'en_US'/);
  assert.match(seo, /return 'pl_PL'/);
  assert.match(routeSeo, /pathname\.startsWith\('\/legal\/'\)/);
});

test('CTA routing remains registration for escorts and an accessible how-it-works anchor', () => {
  assert.match(homeSource, /to="\/register\?type=escort"/);
  assert.match(homeSource, /href="#how-it-works"/);
  assert.match(homeSource, /id="how-it-works"[\s\S]*tabIndex=\{-1\}/);
});

test('sitemap endpoint exposes a safe error rather than a raw database message', () => {
  const route = readFileSync(path.join(root, 'Back/src/routes/sitemap.ts'), 'utf8');
  assert.match(route, /Unable to load sitemap profiles/);
  assert.doesNotMatch(route, /res\.status\(500\).*error\.message/);
});

test('sitemap requests time out and a fetch failure preserves the current sitemap', async () => {
  const hangingFetch = ((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  })) as typeof fetch;
  await assert.rejects(fetchPublishedProfiles('https://api.example', hangingFetch, 5), /timed out.*5 ms/);

  const output = await mkdtemp(path.join(os.tmpdir(), 'seo-sitemap-failure-'));
  try {
    await writeFile(path.join(output, 'sitemap.xml'), 'existing sitemap', 'utf8');
    await assert.rejects(generateSitemaps('https://api.example', output, hangingFetch, 5), /timed out/);
    assert.equal(await readFile(path.join(output, 'sitemap.xml'), 'utf8'), 'existing sitemap');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('successful sitemap writes remove only obsolete numbered profile chunks', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'seo-sitemap-success-'));
  try {
    await writeFile(path.join(output, 'sitemap-profiles-99.xml'), 'stale', 'utf8');
    await writeFile(path.join(output, 'keep.xml'), 'keep', 'utf8');
    await writeSitemaps(output, []);
    await assert.rejects(access(path.join(output, 'sitemap-profiles-99.xml')));
    assert.equal(await readFile(path.join(output, 'keep.xml'), 'utf8'), 'keep');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
