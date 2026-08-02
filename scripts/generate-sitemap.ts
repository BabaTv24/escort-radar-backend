import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SITE_URL = 'https://escort-radar.fun';
export const MAX_URLS_PER_SITEMAP = 40_000;
export const SITEMAP_REQUEST_TIMEOUT_MS = 15_000;

export const staticPublicPaths = [
  '/',
  '/pricing',
  '/contact',
  '/app',
  '/terms',
  '/privacy',
  '/refund-policy',
  '/content-rules',
  '/report-abuse',
  '/legal-notice',
  '/city/berlin',
  '/city/hamburg',
  '/city/hannover',
  '/city/koeln',
  '/city/muenchen',
  '/city/warszawa'
] as const;

export type SitemapProfile = { id: string; updated_at?: string | null };

export function profileToSitemapPath(profile: SitemapProfile) {
  return `/profile/${encodeURIComponent(profile.id)}`;
}

export function renderUrlSet(entries: Array<{ path: string; lastmod?: string | null }>) {
  const body = entries.map(({ path: pathname, lastmod }) => {
    const date = normalizedDate(lastmod);
    return `  <url>\n    <loc>${escapeXml(new URL(pathname, SITE_URL).toString())}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderSitemapIndex(paths: string[]) {
  const body = paths.map((pathname) => `  <sitemap>\n    <loc>${escapeXml(new URL(pathname, SITE_URL).toString())}</loc>\n  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export async function fetchPublishedProfiles(apiUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = SITEMAP_REQUEST_TIMEOUT_MS) {
  const profiles: SitemapProfile[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const url = new URL('/api/sitemap/profiles', apiUrl);
    url.searchParams.set('offset', String(offset));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Sitemap request timed out for ${url.toString()} after ${timeoutMs} ms`);
      }
      throw new Error(`Sitemap profile request failed for ${url.toString()}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Sitemap profile request failed for ${url.toString()} (${response.status})`);
    let payload: { profiles?: SitemapProfile[]; next_offset?: number | null };
    try {
      payload = await response.json() as typeof payload;
    } catch {
      throw new Error(`Sitemap profile response was invalid for ${url.toString()}`);
    }
    profiles.push(...(payload.profiles || []).filter((profile) => typeof profile.id === 'string' && profile.id.length > 0));
    const nextOffset = typeof payload.next_offset === 'number' ? payload.next_offset : null;
    if (nextOffset !== null && nextOffset <= offset) throw new Error(`Sitemap pagination did not advance for ${url.toString()}`);
    offset = nextOffset;
  }
  return profiles;
}

export function buildSitemapFiles(profiles: SitemapProfile[]) {
  const staticEntries = staticPublicPaths.map((pathname) => ({ path: pathname }));
  const profileEntries = profiles.map((profile) => ({ path: profileToSitemapPath(profile), lastmod: profile.updated_at }));
  const allEntries = [...staticEntries, ...profileEntries];
  const files = new Map<string, string>();

  if (allEntries.length <= MAX_URLS_PER_SITEMAP) {
    files.set('sitemap.xml', renderUrlSet(allEntries));
    return files;
  }

  const sitemapFiles = ['sitemap-static.xml'];
  files.set('sitemap-static.xml', renderUrlSet(staticEntries));
  for (let start = 0, part = 1; start < profileEntries.length; start += MAX_URLS_PER_SITEMAP, part += 1) {
    const filename = `sitemap-profiles-${part}.xml`;
    sitemapFiles.push(filename);
    files.set(filename, renderUrlSet(profileEntries.slice(start, start + MAX_URLS_PER_SITEMAP)));
  }
  files.set('sitemap.xml', renderSitemapIndex(sitemapFiles.map((filename) => `/${filename}`)));
  return files;
}

export async function writeSitemaps(outputDirectory: string, profiles: SitemapProfile[]) {
  await mkdir(outputDirectory, { recursive: true });
  const files = buildSitemapFiles(profiles);
  const stagingDirectory = await mkdtemp(path.join(outputDirectory, '.sitemap-stage-'));
  try {
    await Promise.all([...files].map(([filename, content]) => writeFile(path.join(stagingDirectory, filename), content, 'utf8')));
    const orderedFiles = [...files.keys()].filter((filename) => filename !== 'sitemap.xml').concat('sitemap.xml');
    for (const filename of orderedFiles) {
      await rename(path.join(stagingDirectory, filename), path.join(outputDirectory, filename));
    }
    const currentFiles = await readdir(outputDirectory);
    const staleProfileSitemaps = currentFiles.filter((filename) => /^sitemap-profiles-\d+\.xml$/.test(filename) && !files.has(filename));
    await Promise.all(staleProfileSitemaps.map((filename) => rm(path.join(outputDirectory, filename), { force: true })));
    return [...files.keys()];
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function generateSitemaps(apiUrl: string, outputDirectory: string, fetchImpl: typeof fetch = fetch, timeoutMs = SITEMAP_REQUEST_TIMEOUT_MS) {
  const profiles = await fetchPublishedProfiles(apiUrl, fetchImpl, timeoutMs);
  return writeSitemaps(outputDirectory, profiles);
}

function normalizedDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function main() {
  const apiUrl = process.env.SITEMAP_API_URL || process.env.VITE_API_URL;
  if (!apiUrl || /localhost|127\.0\.0\.1/.test(apiUrl)) {
    throw new Error('Set SITEMAP_API_URL or production VITE_API_URL before generating the production sitemap.');
  }
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputDirectory = path.join(projectRoot, 'Front', 'public');
  const profiles = await fetchPublishedProfiles(apiUrl);
  const files = await writeSitemaps(outputDirectory, profiles);
  console.info(`Generated ${files.join(', ')} with ${profiles.length} public profiles.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
