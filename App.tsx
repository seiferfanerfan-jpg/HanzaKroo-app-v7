import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView as RawWebView } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewMessageEvent, WebViewNavigation, WebViewOpenWindowEvent } from 'react-native-webview/lib/WebViewTypes';
import { PRAYERS, type Identity } from './src/data/prayers';
import { PORTALS } from './src/data/portals';
import { isWebScheme, normalizePlatformUrl, originOf } from './src/lib/url';
import { getStartupRoute } from './src/lib/startupRoute';
import { useAppState } from './src/lib/appState';
import { createSpeechBridge } from './src/lib/webSpeechBridge';
import { makePageEvent, type BridgeMessage } from './src/lib/webEvents';

const BLUE = '#1479F8';
const NAVY = '#14254A';
const MUTED = '#71809A';
const PALE = '#F2F7FF';
type WebViewHandle = {
  goBack(): void;
  reload(): void;
  stopLoading(): void;
  injectJavaScript(script: string): void;
};

// WebView 14's Android React ref is not represented by its FunctionComponent declaration.
const WebView = RawWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type RecognitionSession = { id: string; phase: 'authorizing' | 'active' | 'stopping' };

function samePageUrl(first: string, second: string): boolean {
  try { return new URL(first).href === new URL(second).href; }
  catch { return first === second; }
}

function platformNameForUrl(url: string | null): string {
  if (!url) return 'لم تُختر منصة بعد';
  return PORTALS.find((portal) => portal.url === url)?.title ?? 'منصة مخصصة';
}

type Screen = 'setup' | 'identity' | 'prayer' | 'platform' | 'settings';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <Image source={require('./assets/icon.png')} style={compact ? styles.brandSmallIcon : styles.brandIcon} resizeMode="contain" />
      <View>
        <Text style={[styles.brandTitle, compact && styles.brandTitleSmall]}>هنذاكروا</Text>
        {!compact && <Text style={styles.brandSubtitle}>خطوة صغيرة كل يوم تصنع فرقًا كبيرًا</Text>}
      </View>
    </View>
  );
}

export function ActionButton({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionButton, secondary && styles.actionButtonSecondary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export function AppScreen({ screen }: { screen: Screen }) {
  const router = useRouter();
  const { prefs, patchPrefs, notificationStatus, activeUrl, setActiveUrl, rollbackUrl, setRollbackUrl } = useAppState();
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [webSourceUrl, setWebSourceUrl] = useState(activeUrl || prefs.platformUrl || '');
  const webSourceUrlRef = useRef(webSourceUrl);
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  const [micStatus, setMicStatus] = useState('لم يُطلب الإذن بعد');
  const [recognitionStatus, setRecognitionStatus] = useState('يُفحص عند بدء التسجيل');
  const [urlSaving, setUrlSaving] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const webRef = useRef<WebViewHandle | null>(null);
  const initialWebUrl = activeUrl || prefs.platformUrl || '';
  const currentWebUrlRef = useRef(initialWebUrl);
  const pendingApplyUrlRef = useRef<string | null>(null);
  const httpFailureRef = useRef(false);
  const recognitionSessionRef = useRef<RecognitionSession | null>(null);
  const fullscreenActiveRef = useRef(false);
  const platformFocusedRef = useRef(false);
  const urlSavingRef = useRef(false);
  const identitySavingRef = useRef(false);
  const trustedOrigin = useMemo(() => originOf(activeUrl || prefs.platformUrl || ''), [activeUrl, prefs.platformUrl]);
  const trustedPageOrigin = trustedOrigin && originOf(currentWebUrlRef.current) === trustedOrigin ? trustedOrigin : null;
  const prayer = prefs.identity ? PRAYERS[prefs.identity] : null;

  const recordCurrentWebUrl = useCallback((url: string) => {
    if (!url) return;
    currentWebUrlRef.current = url;
  }, []);

  useEffect(() => {
    if (screen !== 'prayer' || !prayer) return;
    const characters = Array.from(prayer.text);
    if (prefs.skipTyping) {
      setTypedText(prayer.text);
      setIsTyping(false);
      return;
    }
    setTypedText('');
    setIsTyping(true);
    let index = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      index += 1;
      setTypedText(characters.slice(0, index).join(''));
      if (index >= characters.length) {
        setIsTyping(false);
        return;
      }
      timeout = setTimeout(tick, prefs.typingSpeed);
    };
    timeout = setTimeout(tick, prefs.typingSpeed);
    return () => clearTimeout(timeout);
  }, [screen, prayer?.text, prefs.typingSpeed, prefs.skipTyping]);

  useFocusEffect(useCallback(() => {
    if (screen !== 'settings') return;
    let active = true;
    Promise.all([
      Speech.getAvailableVoicesAsync(),
      ExpoSpeechRecognitionModule.getPermissionsAsync(),
      Promise.resolve(ExpoSpeechRecognitionModule.isRecognitionAvailable()),
    ]).then(([voices, permission, recognitionAvailable]) => {
      if (!active) return;
      setVoiceCount(voices.length);
      setMicStatus(permission.granted ? 'الإذن ممنوح' : permission.status === 'undetermined' ? 'لم يُطلب الإذن بعد' : 'الإذن مرفوض؛ راجع إعدادات الجهاز');
      setRecognitionStatus(recognitionAvailable ? 'خدمة التعرف متاحة' : 'لا توجد خدمة تعرف متاحة على الجهاز');
    }).catch(() => {
      if (!active) return;
      setVoiceCount(0);
      setMicStatus('حالة إذن الميكروفون غير متاحة');
      setRecognitionStatus('الخدمة غير متاحة');
    });
    return () => { active = false; };
  }, [screen]));

  useEffect(() => {
    if (screen === 'platform' && activeUrl && activeUrl !== webSourceUrl) {
      webSourceUrlRef.current = activeUrl;
      recordCurrentWebUrl(activeUrl);
      setWebSourceUrl(activeUrl);
      setCanGoBack(false);
      setWebError('');
      httpFailureRef.current = false;
    }
  }, [activeUrl, recordCurrentWebUrl, screen, webSourceUrl]);

  const injectEvent = useCallback((payload: Record<string, unknown>) => {
    if (!trustedOrigin || originOf(currentWebUrlRef.current) !== trustedOrigin) return;
    webRef.current?.injectJavaScript(makePageEvent(payload));
  }, [trustedOrigin]);

  useFocusEffect(useCallback(() => {
    if (screen !== 'platform') return;
    platformFocusedRef.current = true;
    return () => {
      platformFocusedRef.current = false;
      if (fullscreenActiveRef.current) {
        fullscreenActiveRef.current = false;
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
      }
      const session = recognitionSessionRef.current;
      if (session) {
        if (session.phase === 'authorizing') {
          recognitionSessionRef.current = null;
          injectEvent({ kind: 'recognition', name: 'end', sessionId: session.id });
        } else if (session.phase !== 'stopping') {
          session.phase = 'stopping';
          ExpoSpeechRecognitionModule.abort();
        }
      }
      void Speech.stop().catch(() => undefined);
    };
  }, [screen, injectEvent]));

  useEffect(() => {
    if (screen !== 'platform') return;
    const start = ExpoSpeechRecognitionModule.addListener('start', () => {
      const session = recognitionSessionRef.current;
      if (!session || session.phase === 'stopping') return;
      session.phase = 'active';
      setRecognitionStatus('الخدمة تعمل');
      if (platformFocusedRef.current) injectEvent({ kind: 'recognition', name: 'start', sessionId: session.id });
    });
    const end = ExpoSpeechRecognitionModule.addListener('end', () => {
      const session = recognitionSessionRef.current;
      if (!session) return;
      recognitionSessionRef.current = null;
      setRecognitionStatus('انتهى التسجيل');
      injectEvent({ kind: 'recognition', name: 'end', sessionId: session.id });
    });
    const result = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const session = recognitionSessionRef.current;
      if (!session || session.phase !== 'active') return;
      if (!platformFocusedRef.current) return;
      const item = event.results?.[0];
      injectEvent({ kind: 'recognition', name: 'result', sessionId: session.id, transcript: item?.transcript || '', confidence: item?.confidence || 0, isFinal: event.isFinal });
    });
    const error = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      const session = recognitionSessionRef.current;
      if (!session) return;
      recognitionSessionRef.current = null;
      setRecognitionStatus('تعذر استخدام الخدمة');
      if (event.error === 'not-allowed') setMicStatus('الإذن مرفوض');
      injectEvent({ kind: 'recognition', name: 'error', sessionId: session.id, error: event.error, message: event.message });
    });
    return () => {
      start.remove(); end.remove(); result.remove(); error.remove();
      recognitionSessionRef.current = null;
    };
  }, [screen, injectEvent]);

  useEffect(() => {
    if (screen !== 'platform') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      if (fullscreenActiveRef.current) {
        fullscreenActiveRef.current = false;
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
      }
      const session = recognitionSessionRef.current;
      if (session) {
        if (session.phase === 'authorizing') recognitionSessionRef.current = null;
        else if (session.phase !== 'stopping') {
          session.phase = 'stopping';
          ExpoSpeechRecognitionModule.abort();
        }
      }
      void Speech.stop().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [screen]);

  useFocusEffect(useCallback(() => {
    if (screen !== 'platform') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [screen, canGoBack]));

  const saveInitialUrl = async () => {
    if (urlSavingRef.current) return;
    const result = normalizePlatformUrl(urlInput);
    if (!result.value) {
      setUrlError(result.error || 'تحقق من الرابط.');
      return;
    }
    setUrlError('');
    urlSavingRef.current = true;
    setUrlSaving(true);
    try {
      const saved = await patchPrefs({ platformUrl: result.value });
      if (!saved) return;
      setUrlInput(result.value);
      router.replace(prefs.identity ? '/prayer' : '/identity');
    } finally {
      urlSavingRef.current = false;
      setUrlSaving(false);
    }
  };

  const selectIdentity = async (identity: Identity) => {
    if (identitySavingRef.current) return;
    identitySavingRef.current = true;
    setIdentitySaving(true);
    try {
      if (await patchPrefs({ identity })) router.replace('/prayer');
    } finally {
      identitySavingRef.current = false;
      setIdentitySaving(false);
    }
  };

  const beginRecognition = async (message: Extract<BridgeMessage, { type: 'recognition_start' }>) => {
    const sessionId = message.sessionId;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sessionId)) return;
    if (recognitionSessionRef.current) {
      injectEvent({ kind: 'recognition', name: 'error', sessionId, error: 'recognition-already-started', message: 'يوجد طلب تعرف آخر قيد التشغيل.' });
      return;
    }
    const session: RecognitionSession = { id: sessionId, phase: 'authorizing' };
    recognitionSessionRef.current = session;
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setMicStatus(permission.granted ? 'الإذن ممنوح' : 'الإذن مرفوض');
      if (recognitionSessionRef.current !== session) return;
      if (!permission.granted) {
        recognitionSessionRef.current = null;
        setRecognitionStatus('الإذن مطلوب قبل البدء');
        injectEvent({ kind: 'recognition', name: 'error', sessionId, error: 'not-allowed', message: 'لم يُمنح إذن الميكروفون أو التعرف على الكلام.' });
        return;
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        recognitionSessionRef.current = null;
        setRecognitionStatus('لا توجد خدمة تعرف متاحة على الجهاز');
        injectEvent({ kind: 'recognition', name: 'error', sessionId, error: 'service-not-allowed', message: 'لا توجد خدمة تعرف على الكلام متاحة على هذا الجهاز.' });
        return;
      }
      setRecognitionStatus('جارٍ بدء الخدمة');
      session.phase = 'active';
      const requestedLanguage = message.lang || 'ar-EG';
      const language = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(requestedLanguage) ? requestedLanguage : 'ar-EG';
      const maxAlternatives = Number.isInteger(message.maxAlternatives) ? Math.min(5, Math.max(1, message.maxAlternatives || 1)) : 1;
      ExpoSpeechRecognitionModule.start({
        lang: language,
        continuous: !!message.continuous,
        interimResults: !!message.interimResults,
        maxAlternatives,
      });
    } catch (error) {
      if (recognitionSessionRef.current === session) recognitionSessionRef.current = null;
      setMicStatus('الخدمة غير متاحة');
      setRecognitionStatus('الخدمة غير متاحة');
      injectEvent({ kind: 'recognition', name: 'error', sessionId, error: 'service-not-allowed', message: String(error).slice(0, 240) });
    }
  };

  const finishRecognition = (sessionId: string, abort: boolean) => {
    const session = recognitionSessionRef.current;
    if (!session || session.id !== sessionId) return;
    if (session.phase === 'authorizing') {
      recognitionSessionRef.current = null;
      setRecognitionStatus('أُلغي طلب التسجيل قبل بدء الخدمة');
      injectEvent({ kind: 'recognition', name: 'end', sessionId });
      return;
    }
    if (session.phase === 'stopping') return;
    session.phase = 'stopping';
    setRecognitionStatus('جارٍ إيقاف التسجيل');
    try {
      if (abort) ExpoSpeechRecognitionModule.abort();
      else ExpoSpeechRecognitionModule.stop();
    } catch {
      recognitionSessionRef.current = null;
      setRecognitionStatus('تعذر إيقاف التسجيل');
      injectEvent({ kind: 'recognition', name: 'error', sessionId, error: 'aborted', message: 'تعذر إيقاف خدمة التعرف.' });
    }
  };

  const onWebMessage = async (event: WebViewMessageEvent) => {
    const sourceOrigin = originOf(event.nativeEvent.url);
    if (!trustedOrigin || sourceOrigin !== trustedOrigin) return;
    let message: BridgeMessage;
    try { message = JSON.parse(event.nativeEvent.data) as BridgeMessage; } catch { return; }
    if (!platformFocusedRef.current && message.type === 'recognition_start') {
      injectEvent({ kind: 'recognition', name: 'error', sessionId: message.sessionId, error: 'aborted', message: 'توقفت الخدمة لأن صفحة المنصة لم تعد في الواجهة.' });
      return;
    }
    if (!platformFocusedRef.current && message.type === 'tts_speak') {
      injectEvent({ kind: 'tts', name: 'error', id: message.id, error: 'page-not-focused' });
      return;
    }
    switch (message.type) {
      case 'tts_speak': {
        const id = message.id;
        if (!id || id.length > 120 || typeof message.text !== 'string' || message.text.length > 40000) break;
        const requestedLanguage = message.lang || 'ar-EG';
        const language = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(requestedLanguage) ? requestedLanguage : 'ar-EG';
        const bounded = (value: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
        Speech.speak(message.text, {
          language,
          rate: bounded(message.rate, 1, 0.1, 2),
          pitch: bounded(message.pitch, 1, 0.1, 2),
          volume: bounded(message.volume, 1, 0, 1),
          onStart: () => injectEvent({ kind: 'tts', name: 'start', id }),
          onDone: () => injectEvent({ kind: 'tts', name: 'end', id }),
          onStopped: () => injectEvent({ kind: 'tts', name: 'end', id }),
          onError: (error) => injectEvent({ kind: 'tts', name: 'error', id, error: error.message }),
        });
        break;
      }
      case 'tts_cancel': await Speech.stop(); break;
      case 'tts_pause':
        if (Platform.OS === 'ios') await Speech.pause();
        else injectEvent({ kind: 'tts', name: 'error', id: '', error: 'pause-not-supported-on-android' });
        break;
      case 'tts_resume':
        if (Platform.OS === 'ios') await Speech.resume();
        else injectEvent({ kind: 'tts', name: 'error', id: '', error: 'resume-not-supported-on-android' });
        break;
      case 'tts_get_voices': {
        try {
          const voices = await Speech.getAvailableVoicesAsync();
          injectEvent({ kind: 'voices', voices: voices.map((voice) => ({ voiceURI: voice.identifier, name: voice.name, lang: voice.language, default: false, localService: true })) });
        } catch {
          injectEvent({ kind: 'voices', voices: [] });
        }
        break;
      }
      case 'recognition_start': await beginRecognition(message); break;
      case 'recognition_stop': finishRecognition(message.sessionId, false); break;
      case 'recognition_abort': finishRecognition(message.sessionId, true); break;
      case 'fullscreen':
        fullscreenActiveRef.current = platformFocusedRef.current && !!message.active;
        try {
          if (!platformFocusedRef.current || !message.active) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch { /* The device or OS may not allow orientation changes. */ }
        break;
    }
  };

  const openSavedSite = () => {
    if (!prefs.platformUrl) {
      router.replace('/setup');
      return;
    }
    setActiveUrl(prefs.platformUrl);
    router.push('/platform');
  };

  const openSettings = () => router.push('/settings');

  const renderUrlForm = () => (
    <KeyboardAvoidingView style={styles.formFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Brand />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>إعداد اختياري</Text>
          <Text style={styles.heading}>أهلًا بيك في هنذاكروا</Text>
          <Text style={styles.body}>لو عندك منصة مخصصة، تقدر تكتب عنوانها هنا. أو ارجع للشاشة الرئيسية واختار Portal أو V1.</Text>
          <Text style={styles.fieldLabel}>رابط المنصة (HTTPS)</Text>
          <TextInput
            value={urlInput}
            onChangeText={(value) => { setUrlInput(value); setUrlError(''); }}
            placeholder="https://…"
            placeholderTextColor="#9AA7BB"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textAlign="left"
            style={styles.input}
            accessibilityLabel="رابط المنصة التعليمية"
          />
          {!!urlError && <Text style={styles.errorText}>{urlError}</Text>}
          <ActionButton title="حفظ ومتابعة" disabled={urlSaving} onPress={saveInitialUrl} />
          <Text style={styles.hint}>الاختيار بين Portal وV1 متاح دائمًا من الشاشة الرئيسية.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (screen === 'setup') {
    return <View style={styles.page}><StatusBar style="dark" />{renderUrlForm()}</View>;
  }

  if (screen === 'identity') {
    return (
      <View style={styles.page}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.identityContent} keyboardShouldPersistTaps="handled">
          <Brand />
          <View style={styles.card}>
            <Text style={styles.eyebrow}>خطوة واحدة ونبدأ</Text>
            <Text style={styles.heading}>أنت مين؟</Text>
            <Text style={styles.body}>اختار هويتك عشان يظهر دعاءك في مسار الدعاء قبل المنصة.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="اختيار هوية سيف" accessibilityState={{ selected: prefs.identity === 'saif', disabled: identitySaving }} disabled={identitySaving} style={styles.identityChoice} onPress={() => selectIdentity('saif')}><Text style={styles.identityEmoji}>✦</Text><Text style={styles.identityText}>سيف</Text><Text style={styles.choiceArrow}>‹</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="اختيار هوية حنون" accessibilityState={{ selected: prefs.identity === 'hanoun', disabled: identitySaving }} disabled={identitySaving} style={styles.identityChoice} onPress={() => selectIdentity('hanoun')}><Text style={styles.identityEmoji}>✦</Text><Text style={styles.identityText}>حنون</Text><Text style={styles.choiceArrow}>‹</Text></Pressable>
          </View>
          <Text style={styles.footerNote}>اختيارك محفوظ على جهازك، وتقدر تغيّره من الإعدادات.</Text>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'prayer' && prayer) {
    const completeText = () => { setTypedText(prayer.text); setIsTyping(false); };
    return (
      <View style={styles.page}>
        <StatusBar style="dark" />
        <ScrollView style={styles.prayerScroll} contentContainerStyle={styles.prayerContent}>
          <Brand compact />
          <View style={styles.prayerCard}>
            <View style={styles.prayerMark}><Text style={styles.prayerMarkText}>✦</Text></View>
            <Text style={styles.eyebrow}>بداية هادئة ليومك</Text>
            <Text style={styles.prayerTitle}>{prayer.title}</Text>
            <View style={styles.prayerRule} />
            <Text selectable style={[styles.prayerText, { fontSize: prefs.prayerFontSize, lineHeight: prefs.prayerFontSize * 1.95 }]}>{typedText}{isTyping ? '▍' : ''}</Text>
          </View>
        </ScrollView>
        <View style={styles.prayerActions}>
          {isTyping && <ActionButton title="تخطي الكتابة" secondary onPress={completeText} />}
          {!isTyping && <ActionButton title="التالي — افتح المنصة" onPress={openSavedSite} />}
          <Pressable accessibilityRole="button" accessibilityLabel="فتح الإعدادات" onPress={openSettings} style={styles.textButton}><Text style={styles.textButtonLabel}>الإعدادات</Text></Pressable>
        </View>
      </View>
    );
  }

  if (screen === 'settings') {
    return (
      <View style={styles.page}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
          <View style={styles.settingsHeader}><Brand compact /><Pressable style={styles.closeButton} onPress={() => router.back()}><Text style={styles.closeButtonText}>رجوع</Text></Pressable></View>
          <Text style={styles.heading}>إعدادات التطبيق</Text>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>المنصة</Text>
            <Text style={styles.body}>المنصة المختارة: {platformNameForUrl(prefs.platformUrl)}</Text>
            <Text style={styles.hint}>يمكنك التبديل بين البوابتين من شاشة الترحيب.</Text>
            <ActionButton title="اختيار منصة أخرى" secondary onPress={() => router.navigate('/')} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الهوية</Text>
            <Text style={styles.body}>الهوية الحالية: {prefs.identity ? PRAYERS[prefs.identity].name : 'غير محددة'}</Text>
            <View style={styles.inlineActions}>
              <ActionButton title="سيف" secondary onPress={() => { void patchPrefs({ identity: 'saif' }); }} />
              <ActionButton title="حنون" secondary onPress={() => { void patchPrefs({ identity: 'hanoun' }); }} />
            </View>
            <ActionButton title="ابدأ بالدعاء قبل المنصة" secondary onPress={() => router.push(getStartupRoute(prefs))} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الإشعارات</Text>
            <View style={styles.settingRow}><Text style={styles.body}>إشعار ترحيب عند فتح التطبيق</Text><Switch accessibilityLabel="إشعار الترحيب عند فتح التطبيق" accessibilityState={{ checked: prefs.welcomeNotifications }} value={prefs.welcomeNotifications} onValueChange={(value) => { void patchPrefs({ welcomeNotifications: value }); }} trackColor={{ true: BLUE }} /></View>
            <Text style={styles.body}>حالة الإذن: {notificationStatus}</Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.textButton}><Text style={styles.textButtonLabel}>فتح إعدادات أندرويد</Text></Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الصوت والعرض</Text>
            <Text style={styles.body}>تحويل النص إلى كلام: {voiceCount === null ? 'جارٍ الفحص…' : voiceCount > 0 ? `متاح — ${voiceCount} صوت` : 'لا توجد أصوات معلنة من النظام'}</Text>
            <Text style={styles.body}>التعرف على الكلام: {recognitionStatus}</Text>
            <Text style={styles.body}>الميكروفون: {micStatus}</Text>
            <Text style={[styles.hint, { marginTop: 8 }]}>إيقاف/استئناف النطق الأصلي غير متاح عبر Expo Speech على Android حاليًا.</Text>
            <View style={styles.settingRow}><Text style={styles.body}>سرعة الكتابة</Text><View style={styles.speedControl}><Pressable accessibilityRole="button" accessibilityLabel="إبطاء ظهور الدعاء" accessibilityState={{ disabled: prefs.typingSpeed >= 80 }} disabled={prefs.typingSpeed >= 80} onPress={() => { void patchPrefs({ typingSpeed: Math.min(80, prefs.typingSpeed + 5) }); }} style={styles.speedButton}><Text style={styles.speedText}>+</Text></Pressable><Text style={styles.speedValue}>{prefs.typingSpeed} ms</Text><Pressable accessibilityRole="button" accessibilityLabel="تسريع ظهور الدعاء" accessibilityState={{ disabled: prefs.typingSpeed <= 5 }} disabled={prefs.typingSpeed <= 5} onPress={() => { void patchPrefs({ typingSpeed: Math.max(5, prefs.typingSpeed - 5) }); }} style={styles.speedButton}><Text style={styles.speedText}>−</Text></Pressable></View></View>
            <View style={styles.settingRow}><Text style={styles.body}>حجم خط الدعاء</Text><View style={styles.speedControl}><Pressable accessibilityRole="button" accessibilityLabel="تكبير خط الدعاء" accessibilityState={{ disabled: prefs.prayerFontSize >= 26 }} disabled={prefs.prayerFontSize >= 26} onPress={() => { void patchPrefs({ prayerFontSize: Math.min(26, prefs.prayerFontSize + 1) }); }} style={styles.speedButton}><Text style={styles.speedText}>+</Text></Pressable><Text style={styles.speedValue}>{prefs.prayerFontSize}</Text><Pressable accessibilityRole="button" accessibilityLabel="تصغير خط الدعاء" accessibilityState={{ disabled: prefs.prayerFontSize <= 15 }} disabled={prefs.prayerFontSize <= 15} onPress={() => { void patchPrefs({ prayerFontSize: Math.max(15, prefs.prayerFontSize - 1) }); }} style={styles.speedButton}><Text style={styles.speedText}>−</Text></Pressable></View></View>
            <View style={styles.settingRow}><Text style={styles.body}>تخطي تأثير الكتابة</Text><Switch accessibilityLabel="تجاوز تأثير كتابة الدعاء" accessibilityState={{ checked: prefs.skipTyping }} value={prefs.skipTyping} onValueChange={(value) => { void patchPrefs({ skipTyping: value }); }} trackColor={{ true: BLUE }} /></View>
          </View>
          <View style={styles.card}><Text style={styles.sectionTitle}>وضع الكشك</Text><Text style={styles.body}>ملء شاشة الفيديو مدعوم حسب الموقع. قفل الجهاز بنمط Kiosk الحقيقي غير مفعّل ويحتاج إدارة جهاز أندرويد.</Text></View>
          <ActionButton title="العودة" secondary onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  if (!prefs.platformUrl || !webSourceUrl) return <View style={styles.loadingScreen}><StatusBar style="dark" /><ActivityIndicator size="large" color={BLUE} /><Text style={styles.body}>بنجهّز المنصة…</Text></View>;
  return (
    <View style={styles.webPage}>
      <StatusBar style="dark" />
      <View style={styles.webHeader}>
        <Brand compact />
        <View style={styles.webHeaderActions}>
          <Pressable style={styles.headerButton} accessibilityLabel="العودة إلى اختيار المنصة" onPress={() => router.navigate('/')}><Text style={styles.headerButtonText}>الرئيسية</Text></Pressable>
          <Pressable style={styles.headerButton} accessibilityLabel="إعدادات" onPress={openSettings}><Text style={styles.headerButtonText}>الإعدادات</Text></Pressable>
          <Pressable style={styles.headerButton} accessibilityLabel="إظهار أو إخفاء الأدوات" onPress={() => setShowToolbar((value) => !value)}><Text style={styles.headerButtonText}>{showToolbar ? 'إخفاء' : 'أدوات'}</Text></Pressable>
        </View>
      </View>
      <View style={styles.webContainer}>
        <WebView
          key={webSourceUrl}
          ref={webRef}
          source={{ uri: webSourceUrl }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          originWhitelist={['https://*', 'about:blank']}
          injectedJavaScriptBeforeContentLoaded={trustedPageOrigin ? createSpeechBridge(trustedPageOrigin) : 'true;'}
          onShouldStartLoadWithRequest={(request) => webSourceUrlRef.current === webSourceUrl && (request.url === 'about:blank' || isWebScheme(request.url))}
          onNavigationStateChange={(state: WebViewNavigation) => {
            if (webSourceUrlRef.current !== webSourceUrl) return;
            const url = state.url || currentWebUrlRef.current;
            if (originOf(currentWebUrlRef.current) === trustedOrigin && originOf(url) !== trustedOrigin) {
              const session = recognitionSessionRef.current;
              if (session) {
                injectEvent({ kind: 'recognition', name: 'end', sessionId: session.id });
                if (session.phase === 'authorizing') recognitionSessionRef.current = null;
                else if (session.phase !== 'stopping') {
                  session.phase = 'stopping';
                  ExpoSpeechRecognitionModule.abort();
                }
              }
              injectEvent({ kind: 'tts-reset' });
              void Speech.stop().catch(() => undefined);
            }
            recordCurrentWebUrl(url);
            setCanGoBack(state.canGoBack);
          }}
          onLoadStart={() => { if (webSourceUrlRef.current !== webSourceUrl) return; httpFailureRef.current = false; setWebLoading(true); setWebError(''); }}
          onLoadEnd={() => { if (webSourceUrlRef.current === webSourceUrl) setWebLoading(false); }}
          onLoad={async (event) => {
            if (webSourceUrlRef.current !== webSourceUrl) return;
            recordCurrentWebUrl(event.nativeEvent.url || currentWebUrlRef.current);
            setWebLoading(false);
            if (httpFailureRef.current) return;
            setWebError('');
            const pendingUrl = pendingApplyUrlRef.current;
            if (!pendingUrl) {
              setRollbackUrl(null);
              return;
            }
            if (await patchPrefs({ platformUrl: pendingUrl })) {
              pendingApplyUrlRef.current = null;
              setRollbackUrl(null);
            } else {
              setWebError('تم فتح الرابط الجديد، لكن تعذر حفظه. سيظل الرابط السابق محفوظًا على الجهاز.');
            }
          }}
          onError={(event: WebViewErrorEvent) => {
            if (webSourceUrlRef.current !== webSourceUrl) return;
            httpFailureRef.current = true;
            setWebLoading(false);
            setWebError(`تعذر فتح الصفحة${event.nativeEvent.code ? ` (رمز ${event.nativeEvent.code})` : ''}. تحقق من اتصال الإنترنت أو جرّب الرابط مرة أخرى.`);
          }}
          onHttpError={(event: WebViewHttpErrorEvent) => {
            if (webSourceUrlRef.current !== webSourceUrl) return;
            const failedUrl = event.nativeEvent.url;
            if (failedUrl && currentWebUrlRef.current && !samePageUrl(failedUrl, currentWebUrlRef.current)) return;
            httpFailureRef.current = true;
            setWebLoading(false);
            const status = event.nativeEvent.statusCode;
            setWebError(status >= 500 ? `استجابت المنصة بخطأ مؤقت (${status}). حاول مرة أخرى بعد قليل.` : `استجابت المنصة بخطأ (${status}). راجع الرابط أو بيانات الدخول ثم أعد المحاولة.`);
          }}
          onMessage={(event) => { if (webSourceUrlRef.current === webSourceUrl) void onWebMessage(event); }}
          onOpenWindow={(event: WebViewOpenWindowEvent) => {
            if (webSourceUrlRef.current !== webSourceUrl) return;
            const target = event.nativeEvent.targetUrl;
            if (isWebScheme(target)) { recordCurrentWebUrl(target); webRef.current?.stopLoading(); webRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(target)};true;`); }
          }}
        />
        {webLoading && <View pointerEvents="none" style={styles.loadingOverlay}><ActivityIndicator size="small" color={BLUE} /><Text style={styles.loadingLabel}>جارٍ فتح المنصة…</Text></View>}
        {!!webError && <View style={styles.webError}><View style={styles.errorCard}><Text style={styles.errorTitle}>ما قدرنا نفتح المنصة</Text><Text style={styles.body}>{webError}</Text><ActionButton title="إعادة المحاولة" onPress={() => { httpFailureRef.current = false; setWebError(''); webRef.current?.reload(); }} />{rollbackUrl && <ActionButton title="الرجوع للرابط السابق" secondary onPress={() => { const oldUrl = rollbackUrl; pendingApplyUrlRef.current = null; httpFailureRef.current = false; setRollbackUrl(null); setActiveUrl(oldUrl); setUrlInput(oldUrl); recordCurrentWebUrl(oldUrl); webSourceUrlRef.current = oldUrl; setWebSourceUrl(oldUrl); setCanGoBack(false); setWebError(''); }} />}<ActionButton title="الإعدادات" secondary onPress={openSettings} /></View></View>}
      </View>
      {showToolbar && <View style={styles.toolbar}>
        <Pressable style={styles.toolButton} onPress={() => canGoBack ? webRef.current?.goBack() : router.back()}><Text style={styles.toolIcon}>‹</Text><Text style={styles.toolLabel}>رجوع</Text></Pressable>
        <Pressable style={styles.toolButton} onPress={() => { setWebError(''); webRef.current?.reload(); }}><Text style={styles.toolIcon}>↻</Text><Text style={styles.toolLabel}>تحديث</Text></Pressable>
        <Pressable style={styles.toolButton} onPress={openSettings}><Text style={styles.toolIcon}>⚙</Text><Text style={styles.toolLabel}>الإعدادات</Text></Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7FAFF' },
  formFlex: { flex: 1 },
  formContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28, gap: 22 },
  brand: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, alignSelf: 'center' },
  brandIcon: { width: 72, height: 72, borderRadius: 18, backgroundColor: '#FFFFFF' },
  brandSmallIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF' },
  brandTitle: { color: NAVY, fontSize: 24, fontWeight: '900', textAlign: 'right' },
  brandTitleSmall: { fontSize: 19 },
  brandSubtitle: { color: MUTED, fontSize: 12, textAlign: 'right', marginTop: 3 },
  card: { width: '100%', borderRadius: 24, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7EEF8', marginBottom: 14, shadowColor: '#15315B', shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  eyebrow: { color: BLUE, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 9 },
  heading: { color: NAVY, fontSize: 26, fontWeight: '900', textAlign: 'right', marginBottom: 8 },
  body: { color: MUTED, fontSize: 14, lineHeight: 23, textAlign: 'right' },
  fieldLabel: { color: NAVY, fontSize: 13, fontWeight: '700', textAlign: 'right', marginTop: 22, marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#DCE6F3', backgroundColor: '#FBFDFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: NAVY, fontSize: 14, marginBottom: 12 },
  errorText: { color: '#C4333B', fontSize: 13, textAlign: 'right', marginBottom: 8, lineHeight: 20 },
  hint: { color: MUTED, fontSize: 12, lineHeight: 20, textAlign: 'right', marginTop: 12 },
  actionButton: { minHeight: 50, backgroundColor: BLUE, borderRadius: 15, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 8 },
  actionButtonSecondary: { backgroundColor: PALE, borderWidth: 1, borderColor: '#DCE9FB' },
  actionButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  actionButtonTextSecondary: { color: NAVY },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  identityContent: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 24 },
  prayerScroll: { flex: 1 },
  identityChoice: { flexDirection: 'row-reverse', alignItems: 'center', minHeight: 66, borderRadius: 16, backgroundColor: '#F8FBFF', borderWidth: 1, borderColor: '#E2ECF8', paddingHorizontal: 16, marginTop: 12 },
  identityEmoji: { color: BLUE, fontSize: 20, marginLeft: 12 },
  identityText: { color: NAVY, fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  choiceArrow: { color: BLUE, fontSize: 28, fontWeight: '300' },
  footerNote: { color: MUTED, fontSize: 12, textAlign: 'center', lineHeight: 20 },
  prayerContent: { flexGrow: 1, padding: 20, paddingBottom: 34, gap: 20, justifyContent: 'center' },
  prayerCard: { borderRadius: 26, padding: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4EDF8', shadowColor: '#15315B', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  prayerMark: { width: 42, height: 42, borderRadius: 15, alignSelf: 'center', backgroundColor: '#E9F2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  prayerMarkText: { color: BLUE, fontSize: 20 },
  prayerTitle: { color: NAVY, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  prayerRule: { width: 54, height: 3, borderRadius: 3, backgroundColor: BLUE, alignSelf: 'center', marginVertical: 17 },
  prayerText: { color: '#253552', fontSize: 17, lineHeight: 33, textAlign: 'right', writingDirection: 'rtl' },
  prayerActions: { gap: 4, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, backgroundColor: '#F7FAFF' },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: MUTED, fontSize: 13, fontWeight: '700' },
  settingsContent: { padding: 18, paddingBottom: 34 },
  settingsHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  closeButton: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, backgroundColor: PALE },
  closeButtonText: { color: NAVY, fontWeight: '700' },
  sectionTitle: { color: NAVY, fontSize: 17, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
  inlineActions: { flexDirection: 'row', gap: 10 },
  settingRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 42 },
  speedControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  speedButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: PALE, borderRadius: 11 },
  speedText: { color: BLUE, fontSize: 20, fontWeight: '700' },
  speedValue: { color: NAVY, fontSize: 12, fontWeight: '700' },
  loadingScreen: { flex: 1, backgroundColor: '#F7FAFF', alignItems: 'center', justifyContent: 'center', gap: 16 },
  webPage: { flex: 1, backgroundColor: '#FFFFFF' },
  webHeader: { height: 54, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E8EEF7', backgroundColor: '#FFFFFF' },
  webHeaderActions: { flexDirection: 'row-reverse', gap: 7 },
  headerButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: PALE },
  headerButtonText: { color: NAVY, fontSize: 12, fontWeight: '700' },
  webContainer: { flex: 1 },
  webView: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row-reverse', gap: 8, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#E4EDF8' },
  loadingLabel: { color: NAVY, fontSize: 12 },
  webError: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(247,250,255,0.96)' },
  errorCard: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E5EDF7', padding: 20 },
  errorTitle: { color: NAVY, fontSize: 19, fontWeight: '900', textAlign: 'right', marginBottom: 8 },
  toolbar: { height: 60, flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8EEF7', paddingBottom: Platform.OS === 'android' ? 2 : 0 },
  toolButton: { alignItems: 'center', justifyContent: 'center', minWidth: 72, minHeight: 52 },
  toolIcon: { color: BLUE, fontSize: 22, lineHeight: 24, fontWeight: '700' },
  toolLabel: { color: NAVY, fontSize: 10, fontWeight: '700', marginTop: 1 },
});
