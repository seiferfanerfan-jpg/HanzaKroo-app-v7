const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PORTALS } = require('../.test-dist/data/portals.js');

test('Portal and V1 choices map to their intended HTTPS destinations', () => {
  assert.deepEqual(PORTALS.map(({ id, title }) => [id, title]), [
    ['portal', 'هنذاكروا Portal'],
    ['v1', 'هنذاكروا V1'],
  ]);
  assert.equal(PORTALS[0].url, 'https://haneenstudy-tu9hntzp.manus.space/baccalaureate');
  assert.equal(PORTALS[1].url, 'https://hanzakro-2026-10-26-v1.vercel.app/');
  assert.ok(PORTALS.every(({ url }) => url.startsWith('https://')));
});

test('welcome screen renders only portal choices without raw website addresses', () => {
  const source = fs.readFileSync('src/app/index.tsx', 'utf8');
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /haneenstudy|hanzakro-2026-10-26/i);
  assert.doesNotMatch(source, /ابدأ بالدعاء/);
  assert.match(source, /portal\.title/);
});
