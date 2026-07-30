import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesUrl = new URL('../Front/src/styles.css', import.meta.url);
const homeUrl = new URL('../Front/src/pages/HomePage.tsx', import.meta.url);
const layoutUrl = new URL('../Front/src/components/Layout.tsx', import.meta.url);

test('FunPage owns one viewport-centered width contract', async () => {
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(styles, /\.landing-page\s*\{[^}]*width:\s*min\(1500px,\s*calc\(100vw - 24px\)\)/s);
  assert.match(styles, /\.app-shell:has\(\.landing-page\)\s*>\s*main\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(styles, /\.landing-page\s*>\s*\.landing-section[\s\S]*?width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(styles, /\.landing-page\s+\.profile-carousel\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.app-shell:has\(\.landing-page\)\s*>\s*\.market-header\s*\{[^}]*left:\s*max\(12px,\s*calc\(\(100vw - 1500px\) \/ 2\)\)[^}]*right:\s*auto/s);
  assert.doesNotMatch(styles, /html,\s*body,\s*#root\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/s);
});

test('FunPage keeps the real carousel, radar, promotions and footer in the layout', async () => {
  const [home, layout] = await Promise.all([
    readFile(homeUrl, 'utf8'),
    readFile(layoutUrl, 'utf8')
  ]);

  assert.match(home, /className="page landing-page"/);
  assert.match(home, /ProfileCarouselSection/);
  assert.match(home, /className="landing-section live-radar-section"/);
  assert.match(home, /FunPagePromotionArea/);
  assert.match(layout, /className="footer"/);
});
