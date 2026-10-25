const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { normalizePlatformUrl, originOf, isWebScheme } = require('../.test-dist/lib/url.js');
const { DEFAULT_PREFERENCES, deserializePreferences, applyPreferencePatch } = require('../.test-dist/lib/preferencesModel.js');
const { getStartupRoute } = require('../.test-dist/lib/startupRoute.js');
const { PRAYERS } = require('../.test-dist/data/prayers.js');

test('platform URL accepts HTTPS and rejects credentials or insecure schemes', () => {
  assert.equal(normalizePlatformUrl('  https://study.example/lesson  ').value, 'https://study.example/lesson');
  assert.match(normalizePlatformUrl('http://study.example').error, /https/);
  assert.match(normalizePlatformUrl('https://student:secret@study.example').error, /بيانات دخول/);
  assert.ok(normalizePlatformUrl('https://').error);
  assert.ok(normalizePlatformUrl('   ').error);
});

test('origin matching includes scheme, host, and non-default port', () => {
  assert.equal(originOf('https://study.example:8443/video'), 'https://study.example:8443');
  assert.notEqual(originOf('https://study.example:8443'), originOf('https://study.example:9443'));
  assert.notEqual(originOf('https://study.example'), originOf('https://study.example.evil'));
  assert.equal(originOf('http://study.example'), null);
  assert.equal(originOf('https://user@study.example'), null);
});

test('WebView permits only valid HTTPS URLs and about:blank', () => {
  assert.equal(isWebScheme('about:blank'), true);
  assert.equal(isWebScheme('https://study.example/video'), true);
  assert.equal(isWebScheme('javascript:alert(1)'), false);
  assert.equal(isWebScheme('http://study.example'), false);
  assert.equal(isWebScheme('https://user@study.example'), false);
});

test('preference parsing uses safe defaults, clamps ranges, and rejects corrupted JSON', () => {
  assert.deepEqual(deserializePreferences(null), DEFAULT_PREFERENCES);
  assert.throws(() => deserializePreferences('{broken'), /تالف/);
  const value = deserializePreferences(JSON.stringify({
    platformUrl: 'http://unsafe.example',
    identity: 'unknown',
    typingSpeed: 1000,
    prayerFontSize: 1,
    welcomeNotifications: false,
    skipTyping: true,
  }));
  assert.equal(value.platformUrl, null);
  assert.equal(value.identity, null);
  assert.equal(value.typingSpeed, 80);
  assert.equal(value.prayerFontSize, 15);
  assert.equal(value.welcomeNotifications, false);
  assert.equal(value.skipTyping, true);
});

test('partial preference updates preserve unrelated values and enforce the same bounds', () => {
  const current = { ...DEFAULT_PREFERENCES, platformUrl: 'https://study.example/', identity: 'hanoun' };
  const next = applyPreferencePatch(current, { typingSpeed: 1 });
  assert.equal(next.platformUrl, current.platformUrl);
  assert.equal(next.identity, current.identity);
  assert.equal(next.typingSpeed, 5);
  assert.notEqual(next, current);
});

test('cold start route selects setup, identity, then prayer in order', () => {
  assert.equal(getStartupRoute({ platformUrl: null, identity: null }), '/setup');
  assert.equal(getStartupRoute({ platformUrl: 'https://study.example/', identity: null }), '/identity');
  assert.equal(getStartupRoute({ platformUrl: 'https://study.example/', identity: 'saif' }), '/prayer');
});

test('changing identity selects the matching prayer without losing other preferences', () => {
  const current = { ...DEFAULT_PREFERENCES, platformUrl: 'https://study.example/', identity: 'saif', welcomeNotifications: false, skipTyping: true };
  const next = applyPreferencePatch(current, { identity: 'hanoun' });
  assert.equal(next.identity, 'hanoun');
  assert.equal(PRAYERS[next.identity].title, 'دعاء حنون');
  assert.equal(next.platformUrl, current.platformUrl);
  assert.equal(next.welcomeNotifications, false);
  assert.equal(next.skipTyping, true);
  assert.equal(next.typingSpeed, current.typingSpeed);
  assert.equal(PRAYERS.saif.title, 'دعاء سيف');
});

test('prayer text remains byte-for-byte equal to the supplied specification', () => {
  const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
  assert.equal(hash(PRAYERS.saif.text), '260a58eb5ffd901bc0f6a6ff680e66698b75d016552012c182825b3baa35755c');
  assert.equal(hash(PRAYERS.hanoun.text), '6e20c368df4566ca8a88c257995b1980ad32afb33ec7eb608d176391fb5b2a63');
});

const { createWelcomePoster, isWelcomeEligible } = require('../.test-dist/lib/welcomeNotificationCore.js');

test('welcome notification waits until platform and identity setup is complete and enabled', () => {
  assert.equal(isWelcomeEligible(DEFAULT_PREFERENCES), false);
  assert.equal(isWelcomeEligible({ ...DEFAULT_PREFERENCES, platformUrl: 'https://study.example/', identity: 'saif' }), true);
  assert.equal(isWelcomeEligible({ ...DEFAULT_PREFERENCES, platformUrl: 'https://study.example/', identity: 'saif', welcomeNotifications: false }), false);
});

test('welcome notification creates the Android channel before requesting permission and posts once', async () => {
  const order = [];
  let permissionCalls = 0;
  const post = createWelcomePoster({
    platform: 'android',
    ensureChannel: async () => { order.push('channel'); },
    getPermission: async () => { order.push('check'); return { granted: false, status: 'undetermined' }; },
    requestPermission: async () => { order.push('request'); permissionCalls += 1; return { granted: true, status: 'granted' }; },
    schedule: async () => { order.push('schedule'); },
  });
  assert.equal(await post(), 'posted');
  assert.equal(await post(), 'already-posted');
  assert.deepEqual(order, ['channel', 'check', 'request', 'schedule']);
  assert.equal(permissionCalls, 1);
});

test('welcome notification does not schedule after permission denial or for unsupported platforms', async () => {
  let schedules = 0;
  const denied = createWelcomePoster({
    platform: 'android',
    ensureChannel: async () => {},
    getPermission: async () => ({ granted: false, status: 'denied' }),
    requestPermission: async () => ({ granted: false, status: 'denied' }),
    schedule: async () => { schedules += 1; },
  });
  assert.equal(await denied(), 'denied');
  const unsupported = createWelcomePoster({
    platform: 'web',
    ensureChannel: async () => {},
    getPermission: async () => ({ granted: true, status: 'granted' }),
    requestPermission: async () => ({ granted: true, status: 'granted' }),
    schedule: async () => { schedules += 1; },
  });
  assert.equal(await unsupported(), 'unsupported');
  assert.equal(schedules, 0);
});

test('welcome notification reports a scheduler error and allows a later retry', async () => {
  let attempts = 0;
  const post = createWelcomePoster({
    platform: 'ios',
    ensureChannel: async () => {},
    getPermission: async () => ({ granted: true, status: 'granted' }),
    requestPermission: async () => ({ granted: true, status: 'granted' }),
    schedule: async () => { attempts += 1; if (attempts === 1) throw new Error('schedule failure'); },
  });
  assert.equal(await post(), 'error');
  assert.equal(await post(), 'posted');
  assert.equal(attempts, 2);
});

const { createPreferencesController } = require('../.test-dist/lib/preferencesController.js');

test('preference controller serializes rapid writes and preserves unrelated fields', async () => {
  const persisted = [];
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const controller = createPreferencesController(DEFAULT_PREFERENCES, async (value) => {
    persisted.push(value);
    if (persisted.length === 1) {
      markFirstStarted();
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
  });
  const first = controller.patch({ platformUrl: 'https://study.example/one' });
  const second = controller.patch({ identity: 'saif' });
  await firstStarted;
  assert.equal(persisted.length, 1);
  releaseFirst();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(persisted.length, 2);
  assert.equal(persisted[1].platformUrl, 'https://study.example/one');
  assert.equal(persisted[1].identity, 'saif');
  assert.equal(controller.getCurrent().identity, 'saif');
});

test('a failed write restores the persisted snapshot when no newer patch exists', async () => {
  const controller = createPreferencesController(DEFAULT_PREFERENCES, async () => { throw new Error('disk full'); });
  const result = await controller.patch({ platformUrl: 'https://study.example/' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.current, DEFAULT_PREFERENCES);
  assert.deepEqual(controller.getCurrent(), DEFAULT_PREFERENCES);
});

test('a later queued write survives an earlier failure without losing its field update', async () => {
  let writes = 0;
  let persisted = DEFAULT_PREFERENCES;
  const controller = createPreferencesController(DEFAULT_PREFERENCES, async (value) => {
    writes += 1;
    if (writes === 1) throw new Error('transient storage error');
    persisted = value;
  });
  const first = controller.patch({ platformUrl: 'https://study.example/' });
  const second = controller.patch({ identity: 'hanoun' });
  const [failed, succeeded] = await Promise.all([first, second]);
  assert.equal(failed.ok, false);
  assert.equal(succeeded.ok, true);
  assert.equal(persisted.platformUrl, 'https://study.example/');
  assert.equal(persisted.identity, 'hanoun');
  assert.equal(controller.getCurrent().identity, 'hanoun');
});

const vm = require('node:vm');
const { createSpeechBridge } = require('../.test-dist/lib/webSpeechBridge.js');

function makeSpeechPage(origin) {
  const messages = [];
  const listeners = {};
  const window = {
    location: { origin },
    ReactNativeWebView: { postMessage: (text) => messages.push(JSON.parse(text)) },
  };
  class TestEvent { constructor(type) { this.type = type; } }
  const document = { addEventListener: (type, listener) => { listeners[type] = listener; } };
  vm.runInNewContext(createSpeechBridge('https://study.example'), { window, location: window.location, document, Event: TestEvent });
  return { window, messages, listeners };
}

test('Web Speech shim forwards a recognition session and drops stale IDs', () => {
  const { window, messages } = makeSpeechPage('https://study.example');
  const recognition = new window.SpeechRecognition();
  const events = [];
  recognition.onstart = () => events.push('start');
  recognition.onresult = (event) => events.push(event.results[0][0].transcript);
  recognition.onend = () => events.push('end');
  recognition.start();
  const startMessage = messages.find((message) => message.type === 'recognition_start');
  assert.ok(startMessage.sessionId);
  assert.throws(() => new window.SpeechRecognition().start(), /already active/);
  window.__hanzakroNativeEvent({ kind: 'recognition', name: 'start', sessionId: startMessage.sessionId });
  window.__hanzakroNativeEvent({ kind: 'recognition', name: 'result', sessionId: 'stale-id', transcript: 'ignored' });
  window.__hanzakroNativeEvent({ kind: 'recognition', name: 'result', sessionId: startMessage.sessionId, transcript: 'تمرين', isFinal: true });
  window.__hanzakroNativeEvent({ kind: 'recognition', name: 'end', sessionId: startMessage.sessionId });
  assert.deepEqual(events, ['start', 'تمرين', 'end']);
  assert.equal(recognition._sessionId, null);
});

test('Web Speech shim is not installed on a different origin', () => {
  const { window } = makeSpeechPage('https://study.example.evil');
  assert.equal(window.SpeechRecognition, undefined);
  assert.equal(window.speechSynthesis, undefined);
});
