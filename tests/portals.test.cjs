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
  assert.equal(PORTALS[1].url, 'https://hanzakro.hanzakro-v1.workers.dev');
  assert.ok(PORTALS.every(({ url }) => url.startsWith('https://')));
});

test('welcome screen renders only portal choices without raw website addresses', () => {
  const source = fs.readFileSync('src/app/welcome.tsx', 'utf8');
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /haneenstudy|hanzakro\.hanzakro-v1/i);
  assert.doesNotMatch(source, /ابدأ بالدعاء/);
  assert.doesNotMatch(source, /بتأثير المدرب/);
  assert.match(source, /تعي برجلك اليمين ده سيستم كامل عشان نجيب 91٪/);
  assert.match(source, /portal\.title/);

  const entry = fs.readFileSync('src/app/index.tsx', 'utf8');
  assert.match(entry, /getStartupRoute\(prefs\)/);
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.ok(app.includes("const goToPortalSelection = () => router.replace('/welcome');"));
  assert.ok(app.includes('title="التالي — اختيار المنصة" onPress={goToPortalSelection}'));
  assert.match(fs.readFileSync('src/app/_layout.tsx', 'utf8'), /name="welcome"/);
});

test('welcome notification uses the requested Arabic message and shows while the app is open', () => {
  const source = fs.readFileSync('src/lib/welcomeNotification.ts', 'utf8');
  assert.match(source, /أهلا وسهلا ي حنونتي ده سيستم كامل عشان نجيب 91٪ مع بعض/);
  assert.match(source, /shouldShowBanner:\s*true/);
  assert.match(source, /trigger:\s*null/);
});

test('Web Speech API bridge exposes both synthesis and recognition adapters', () => {
  const source = fs.readFileSync('src/lib/webSpeechBridge.ts', 'utf8');
  assert.match(source, /SpeechSynthesisUtterance/);
  assert.match(source, /window\.speechSynthesis/);
  assert.match(source, /window\.SpeechRecognition=Recognition/);
  assert.match(source, /window\.webkitSpeechRecognition=Recognition/);
  assert.match(fs.readFileSync('App.tsx', 'utf8'), /case 'tts_speak'/);
  assert.match(fs.readFileSync('App.tsx', 'utf8'), /case 'recognition_start'/);
});
