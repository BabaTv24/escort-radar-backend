import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
process.env.PUBLIC_API_URL = 'https://api.example.test';
process.env.MEDIA_URL_SECRET = 'test-secret-with-at-least-thirty-two-characters';

const mediaPromise = import('../Back/src/mediaDelivery.ts');

test('signed delivery off keeps the legacy public URL', async () => {
  const media = await mediaPromise;
  delete process.env.MEDIA_SIGNED_DELIVERY;
  assert.match(media.storageImageUrl('p1/a.jpg'), /\/storage\/v1\/object\/public\/profile-images\/p1\/a\.jpg$/);
});

test('signed delivery issues backend links that verify only for the signed path and expiry', async () => {
  const media = await mediaPromise;
  process.env.MEDIA_SIGNED_DELIVERY = 'true';
  const url = new URL(media.storageImageUrl('p1/cover.jpg', 'public'));
  assert.equal(url.origin + url.pathname, 'https://api.example.test/api/media/image');
  const path = url.searchParams.get('p')!;
  const exp = Number(url.searchParams.get('e'));
  const sig = url.searchParams.get('s')!;
  assert.equal(media.verifyMediaSignature(path, exp, sig), true);
  assert.equal(media.verifyMediaSignature('p1/gallery.jpg', exp, sig), false, 'path swap');
  assert.equal(media.verifyMediaSignature(path, exp + 60, sig), false, 'expiry extension');
  assert.equal(media.verifyMediaSignature(path, exp, sig.slice(1) + 'A'), false, 'forged signature');
  assert.equal(media.verifyMediaSignature(path, exp, sig, (exp + 1) * 1000), false, 'expired');
});

test('protected links expire within about an hour and public cover links within about a week', async () => {
  const media = await mediaPromise;
  process.env.MEDIA_SIGNED_DELIVERY = 'true';
  const now = Date.UTC(2026, 10, 12, 12, 0, 0);
  const exp = (access: 'public' | 'protected') => Number(new URL(media.storageImageUrl('p/x.jpg', access, now)).searchParams.get('e'));
  assert.ok(exp('protected') - now / 1000 <= 3600 + 15 * 60);
  assert.ok(exp('public') - now / 1000 <= 8 * 24 * 3600);
});

test('stored legacy public URLs are rewritten only for the profile bucket', async () => {
  const media = await mediaPromise;
  process.env.MEDIA_SIGNED_DELIVERY = 'true';
  const rewritten = media.deliverableStorageUrl('http://127.0.0.1:54321/storage/v1/object/public/profile-images/clients/u1/avatar.jpg');
  assert.match(String(rewritten), /^https:\/\/api\.example\.test\/api\/media\/image\?p=clients%2Fu1%2Favatar\.jpg/);
  assert.equal(media.deliverableStorageUrl('https://cdn.example.test/x.jpg'), 'https://cdn.example.test/x.jpg');
});

test('signed delivery refuses to boot without a strong secret', async () => {
  const media = await mediaPromise;
  process.env.MEDIA_SIGNED_DELIVERY = 'true';
  const saved = process.env.MEDIA_URL_SECRET;
  process.env.MEDIA_URL_SECRET = 'short';
  assert.throws(() => media.assertMediaDeliveryConfig(), /MEDIA_URL_SECRET/);
  process.env.MEDIA_URL_SECRET = saved;
  delete process.env.MEDIA_SIGNED_DELIVERY;
});

test('no backend route hands out permanent public Storage URLs for profile images any more', async () => {
  for (const file of ['profiles.ts', 'uploads.ts', 'admin.ts']) {
    const source = await readFile(new URL(`../Back/src/routes/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /getPublicUrl\(image\.storage_path\)|getPublicUrl\(data\.storage_path\)/, file);
  }
  const server = await readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8');
  assert.match(server, /assertMediaDeliveryConfig\(\);/);
  assert.match(server, /app\.get\('\/api\/media\/image'/);
});
