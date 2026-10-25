import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator,
  Alert,
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
import { WebView as RawWebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewOpenWindowEvent } from 'react-native-webview/lib/WebViewTypes';
import { PRAYERS } from './src/data/prayers';
import { isWebScheme, normalizePlatformUrl, originOf } from './src/lib/url';
import { useAppState } from './src/lib/appState';
import type { Preferences } from './src/lib/storage';
import { createSpeechBridge } from './src/lib/webSpeechBridge';
import { makePageEvent, type BridgeMessage } from './src/lib/webEvents';

const BLUE = '#1479F8';
const NAVY = '#14254A';
const MUTED = '#71809A';
const PALE = '#F2F7FF';
const START_URL = 'https://haneenstudy-tu9hntzp.manus.space/baccalaureate';
// react-native-webview 14's generated native component declarations currently
// resolve its public props to `never` under React Native 0.88 / TypeScript 6.
const WebView = RawWebView as unknown as ComponentType<any>;

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
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionButton, secondary && styles.actionButtonSecondary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export function AppScreen({ screen }: { screen: Screen }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { prefs, patchPrefs, notificationStatus, activeUrl, setActiveUrl, rollbackUrl, setRollbackUrl } = useAppState();
  const [urlInput, setUrlInput] = useState(prefs.platformUrl || START_URL);
  const [urlError, setUrlError] = useState('');
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentWebUrl, setCurrentWebUrl] = useState(activeUrl || prefs.platformUrl || '');
  const [webSourceUrl, setWebSourceUrl] = useState(activeUrl || prefs.platformUrl || '');
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  const [micStatus, setMicStatus] = useState('لم يُطلب الإذن بعد');
  const [recognitionStatus, setRecognitionStatus] = useState('يُفحص عند بدء التسجيل');
  const webRef = useRef<any>(null);
  const trustedOrigin = useMemo(() => originOf(activeUrl || prefs.platformUrl || '') || '', [activeUrl, prefs.platformUrl]);
  const prayer = prefs.identity ? PRAYERS[prefs.identity] : null;

  useEffect(() => {
    if (screen === 'settings') setUrlInput(prefs.platformUrl || START_URL);
  }, [screen, prefs.platformUrl]);

  useEffect(() => {
    if (screen !== 'settings') return;
    let active = true;
    Speech.getAvailableVoicesAsync().then((voices) => { if (active) setVoiceCount(voices.length); }).catch(() => { if (active) setVoiceCount(0); });
    return () => { active = false; };
  }, [screen]);

  useEffect(() => {
    if (screen === 'platform' && activeUrl && activeUrl !== webSourceUrl) {
      setCurrentWebUrl(activeUrl);
      setWebSourceUrl(activeUrl);
      setCanGoBack(false);
      setWebError('');
    }
  }, [activeUrl, screen, webSourceUrl]);

  useEffect(() => {
    if (screen !== 'prayer' || !prayer) return;
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
      setTypedText(prayer.text.slice(0, index));
      if (index >= prayer.text.length) {
        setIsTyping(false);
        return;
      }
      timeout = setTimeout(tick, prefs.typingSpeed);
    };
    timeout = setTimeout(tick, prefs.typingSpeed);
    return () => clearTimeout(timeout);
  }, [screen, prayer?.text, prefs.typingSpeed, prefs.skipTyping]);

  const injectEvent = useCallback((payload: Record<string, unknown>) => {
    webRef.current?.injectJavaScript(makePageEvent(payload));
  }, []);

  useEffect(() => {
    if (screen !== 'platform') return;
    const start = ExpoSpeechRecognitionModule.addListener('start', () => { setRecognitionStatus('الخدمة تعمل'); injectEvent({ kind: 'recognition', name: 'start' }); });
    const end = ExpoSpeechRecognitionModule.addListener('end', () => { setRecognitionStatus('انتهى التسجيل'); injectEvent({ kind: 'recognition', name: 'end' }); });
    const result = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const item = event.results?.[0];
      injectEvent({ kind: 'recognition', name: 'result', transcript: item?.transcript || '', confidence: item?.confidence || 0, isFinal: event.isFinal });
    });
    const error = ExpoSpeechRecognitionModule.addListener('error', (event) => { setRecognitionStatus('تعذر استخدام الخدمة'); if (event.error === 'not-allowed') setMicStatus('الإذن مرفوض'); injectEvent({ kind: 'recognition', name: 'error', error: event.error, message: event.message }); });
    return () => { start.remove(); end.remove(); result.remove(); error.remove(); };
  }, [screen, injectEvent]);

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
    const result = normalizePlatformUrl(urlInput);
    if (!result.value) {
      setUrlError(result.error || 'تحقق من الرابط.');
      return;
    }
    setUrlError('');
    const next: Preferences = { ...prefs, platformUrl: result.value };
    await patchPrefs(next);
    setUrlInput(result.value);
    router.replace(next.identity ? '/prayer' : '/identity');
  };

  const saveSettingsUrl = async (applyNow: boolean) => {
    const result = normalizePlatformUrl(urlInput);
    if (!result.value) {
      setUrlError(result.error || 'تحقق من الرابط.');
      return;
    }
    const oldUrl = prefs.platformUrl;
    setUrlError('');
    const next: Preferences = { ...prefs, platformUrl: result.value };
    await patchPrefs(next);
    setUrlInput(result.value);
    if (applyNow) {
      setRollbackUrl(oldUrl && oldUrl !== result.value ? oldUrl : null);
      setActiveUrl(result.value);
      if (params.from === 'platform') router.back();
      else router.replace('/platform');
    } else if (oldUrl && oldUrl !== result.value) {
      Alert.alert('تم حفظ الرابط', 'سيُستخدم الرابط الجديد عند فتح المنصة لاحقًا.');
    }
  };

  const beginRecognition = async (message: Extract<BridgeMessage, { type: 'recognition_start' }>) => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setMicStatus(permission.granted ? 'الإذن ممنوح' : 'الإذن مرفوض');
      if (!permission.granted) {
        setRecognitionStatus('الإذن مطلوب قبل البدء');
        injectEvent({ kind: 'recognition', name: 'error', error: 'not-allowed', message: 'لم يُمنح إذن الميكروفون أو التعرف على الكلام.' });
        return;
      }
      setRecognitionStatus('جارٍ بدء الخدمة');
      ExpoSpeechRecognitionModule.start({
        lang: message.lang || 'ar-EG',
        continuous: !!message.continuous,
        interimResults: !!message.interimResults,
        maxAlternatives: message.maxAlternatives || 1,
      });
    } catch (error) {
      setMicStatus('الخدمة غير متاحة');
      setRecognitionStatus('الخدمة غير متاحة');
      injectEvent({ kind: 'recognition', name: 'error', error: 'service-not-allowed', message: String(error) });
    }
  };

  const onWebMessage = async (event: WebViewMessageEvent) => {
    const sourceOrigin = originOf(event.nativeEvent.url || currentWebUrl);
    if (!sourceOrigin || sourceOrigin !== trustedOrigin) return;
    let message: BridgeMessage;
    try { message = JSON.parse(event.nativeEvent.data) as BridgeMessage; } catch { return; }
    switch (message.type) {
      case 'tts_speak': {
        const id = message.id;
        Speech.speak(message.text, {
          language: message.lang || 'ar-EG',
          rate: Math.min(2, Math.max(0.1, message.rate || 1)),
          pitch: Math.min(2, Math.max(0.1, message.pitch || 1)),
          volume: Math.min(1, Math.max(0, message.volume ?? 1)),
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
      case 'recognition_stop': ExpoSpeechRecognitionModule.stop(); break;
      case 'recognition_abort': ExpoSpeechRecognitionModule.abort(); break;
      case 'fullscreen':
        try {
          if (message.active) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          else await ScreenOrientation.unlockAsync();
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

  const openSettings = (from: 'platform' | 'prayer') => {
    router.push({ pathname: '/settings', params: { from } });
  };

  const renderUrlForm = (settings = false) => (
    <KeyboardAvoidingView style={styles.formFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Brand />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{settings ? 'إعدادات المنصة' : 'الإعداد الأول'}</Text>
          <Text style={styles.heading}>{settings ? 'رابط مذاكرتك' : 'أهلًا بيك في هنذاكروا'}</Text>
          <Text style={styles.body}>{settings ? 'عدّل رابط المنصة. هويتك وباقي تفضيلاتك هتفضل محفوظة.' : 'احفظ رابط منصتك التعليمية مرة واحدة، وهتلاقيها جاهزة في كل مرة.'}</Text>
          <Text style={styles.fieldLabel}>رابط المنصة (HTTPS)</Text>
          <TextInput
            value={urlInput}
            onChangeText={(value) => { setUrlInput(value); setUrlError(''); }}
            placeholder={START_URL}
            placeholderTextColor="#9AA7BB"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textAlign="left"
            style={styles.input}
            accessibilityLabel="رابط المنصة التعليمية"
          />
          {!!urlError && <Text style={styles.errorText}>{urlError}</Text>}
          <ActionButton title={settings ? 'حفظ الرابط' : 'حفظ ومتابعة'} onPress={() => settings ? saveSettingsUrl(false) : saveInitialUrl()} />
          {settings && <ActionButton title="تطبيق الآن" secondary onPress={() => saveSettingsUrl(true)} />}
          {settings && <ActionButton title="رجوع" secondary onPress={() => router.back()} />}
          {!settings && <Text style={styles.hint}>الرابط الافتراضي مقترح ويمكنك تغييره قبل الحفظ.</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (screen === 'setup') {
    return <View style={styles.page}><StatusBar style="dark" />{renderUrlForm(false)}</View>;
  }

  if (screen === 'identity') {
    return (
      <View style={styles.page}>
        <StatusBar style="dark" />
        <View style={styles.identityContent}>
          <Brand />
          <View style={styles.card}>
            <Text style={styles.eyebrow}>خطوة واحدة ونبدأ</Text>
            <Text style={styles.heading}>أنت مين؟</Text>
            <Text style={styles.body}>اختار هويتك عشان يظهر دعاءك في بداية كل تشغيل.</Text>
            <Pressable style={styles.identityChoice} onPress={async () => { await patchPrefs({ ...prefs, identity: 'saif' }); router.replace('/prayer'); }}><Text style={styles.identityEmoji}>✦</Text><Text style={styles.identityText}>سيف</Text><Text style={styles.choiceArrow}>‹</Text></Pressable>
            <Pressable style={styles.identityChoice} onPress={async () => { await patchPrefs({ ...prefs, identity: 'hanoun' }); router.replace('/prayer'); }}><Text style={styles.identityEmoji}>✦</Text><Text style={styles.identityText}>حنون</Text><Text style={styles.choiceArrow}>‹</Text></Pressable>
          </View>
          <Text style={styles.footerNote}>اختيارك محفوظ على جهازك، وتقدر تغيّره من الإعدادات.</Text>
        </View>
      </View>
    );
  }

  if (screen === 'prayer' && prayer) {
    const completeText = () => { setTypedText(prayer.text); setIsTyping(false); };
    return (
      <View style={styles.page}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.prayerContent}>
          <Brand compact />
          <View style={styles.prayerCard}>
            <View style={styles.prayerMark}><Text style={styles.prayerMarkText}>✦</Text></View>
            <Text style={styles.eyebrow}>بداية هادئة ليومك</Text>
            <Text style={styles.prayerTitle}>{prayer.title}</Text>
            <View style={styles.prayerRule} />
            <Text selectable style={[styles.prayerText, { fontSize: prefs.prayerFontSize, lineHeight: prefs.prayerFontSize * 1.95 }]}>{typedText}{isTyping ? '▍' : ''}</Text>
          </View>
          <View style={styles.prayerActions}>
            {isTyping && <ActionButton title="تخطي الكتابة" secondary onPress={completeText} />}
            {!isTyping && <ActionButton title="التالي — افتح المنصة" onPress={openSavedSite} />}
            <Pressable onPress={() => openSettings('prayer')} style={styles.textButton}><Text style={styles.textButtonLabel}>الإعدادات</Text></Pressable>
          </View>
        </ScrollView>
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
            <Text style={styles.currentUrl} numberOfLines={2}>{prefs.platformUrl || 'لا يوجد رابط محفوظ'}</Text>
            <TextInput value={urlInput} onChangeText={(value) => { setUrlInput(value); setUrlError(''); }} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" textAlign="left" style={styles.input} />
            {!!urlError && <Text style={styles.errorText}>{urlError}</Text>}
            <ActionButton title="حفظ الرابط" onPress={() => saveSettingsUrl(false)} />
            <ActionButton title="تطبيق الرابط الآن" secondary onPress={() => saveSettingsUrl(true)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الهوية</Text>
            <Text style={styles.body}>الهوية الحالية: {prefs.identity ? PRAYERS[prefs.identity].name : 'غير محددة'}</Text>
            <View style={styles.inlineActions}>
              <ActionButton title="سيف" secondary onPress={() => patchPrefs({ ...prefs, identity: 'saif' })} />
              <ActionButton title="حنون" secondary onPress={() => patchPrefs({ ...prefs, identity: 'hanoun' })} />
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الإشعارات</Text>
            <View style={styles.settingRow}><Text style={styles.body}>إشعار ترحيب عند فتح التطبيق</Text><Switch value={prefs.welcomeNotifications} onValueChange={(value) => patchPrefs({ ...prefs, welcomeNotifications: value })} trackColor={{ true: BLUE }} /></View>
            <Text style={styles.body}>حالة الإذن: {notificationStatus}</Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.textButton}><Text style={styles.textButtonLabel}>فتح إعدادات أندرويد</Text></Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الصوت والعرض</Text>
            <Text style={styles.body}>تحويل النص إلى كلام: {voiceCount === null ? 'جارٍ الفحص…' : voiceCount > 0 ? `متاح — ${voiceCount} صوت` : 'لا توجد أصوات معلنة من النظام'}</Text>
            <Text style={styles.body}>التعرف على الكلام: {recognitionStatus}</Text>
            <Text style={styles.body}>الميكروفون: {micStatus}</Text>
            <Text style={[styles.hint, { marginTop: 8 }]}>إيقاف/استئناف النطق الأصلي غير متاح عبر Expo Speech على Android حاليًا.</Text>
            <View style={styles.settingRow}><Text style={styles.body}>سرعة الكتابة</Text><View style={styles.speedControl}><Pressable onPress={() => patchPrefs({ ...prefs, typingSpeed: Math.min(80, prefs.typingSpeed + 5) })} style={styles.speedButton}><Text style={styles.speedText}>+</Text></Pressable><Text style={styles.speedValue}>{prefs.typingSpeed} ms</Text><Pressable onPress={() => patchPrefs({ ...prefs, typingSpeed: Math.max(5, prefs.typingSpeed - 5) })} style={styles.speedButton}><Text style={styles.speedText}>−</Text></Pressable></View></View>
            <View style={styles.settingRow}><Text style={styles.body}>حجم خط الدعاء</Text><View style={styles.speedControl}><Pressable onPress={() => patchPrefs({ ...prefs, prayerFontSize: Math.min(26, prefs.prayerFontSize + 1) })} style={styles.speedButton}><Text style={styles.speedText}>+</Text></Pressable><Text style={styles.speedValue}>{prefs.prayerFontSize}</Text><Pressable onPress={() => patchPrefs({ ...prefs, prayerFontSize: Math.max(15, prefs.prayerFontSize - 1) })} style={styles.speedButton}><Text style={styles.speedText}>−</Text></Pressable></View></View>
            <View style={styles.settingRow}><Text style={styles.body}>تخطي تأثير الكتابة</Text><Switch value={prefs.skipTyping} onValueChange={(value) => patchPrefs({ ...prefs, skipTyping: value })} trackColor={{ true: BLUE }} /></View>
          </View>
          <View style={styles.card}><Text style={styles.sectionTitle}>وضع الكشك</Text><Text style={styles.body}>ملء شاشة الفيديو مدعوم حسب الموقع. قفل الجهاز بنمط Kiosk الحقيقي غير مفعّل ويحتاج إدارة جهاز أندرويد.</Text></View>
          <ActionButton title="العودة" secondary onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  const trustedPage = originOf(currentWebUrl) === trustedOrigin;
  if (!prefs.platformUrl || !webSourceUrl) return <View style={styles.loadingScreen}><StatusBar style="dark" /><ActivityIndicator size="large" color={BLUE} /><Text style={styles.body}>بنجهّز المنصة…</Text></View>;
  return (
    <View style={styles.webPage}>
      <StatusBar style="dark" />
      <View style={styles.webHeader}>
        <Brand compact />
        <View style={styles.webHeaderActions}>
          <Pressable style={styles.headerButton} accessibilityLabel="إعدادات" onPress={() => openSettings('platform')}><Text style={styles.headerButtonText}>الإعدادات</Text></Pressable>
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
          injectedJavaScriptBeforeContentLoaded={trustedPage ? createSpeechBridge(trustedOrigin) : 'true;'}
          onShouldStartLoadWithRequest={(request: WebViewNavigation) => request.url === 'about:blank' || isWebScheme(request.url)}
          onNavigationStateChange={(state: WebViewNavigation) => { setCanGoBack(state.canGoBack); setCurrentWebUrl(state.url || currentWebUrl); }}
          onLoadStart={() => { setWebLoading(true); setWebError(''); }}
          onLoadEnd={() => setWebLoading(false)}
          onLoad={() => { setWebLoading(false); setWebError(''); setRollbackUrl(null); }}
          onError={(event: WebViewErrorEvent) => { setWebLoading(false); if (event.nativeEvent.code !== -1) setWebError('تعذر فتح الصفحة. تحقق من اتصال الإنترنت أو جرّب الرابط مرة أخرى.'); }}
          onHttpError={(event: WebViewHttpErrorEvent) => { if (event.nativeEvent.statusCode >= 500) setWebError('المنصة تواجه مشكلة مؤقتة. حاول مرة أخرى بعد قليل.'); }}
          onMessage={onWebMessage}
          onOpenWindow={(event: WebViewOpenWindowEvent) => {
            const target = event.nativeEvent.targetUrl;
            if (isWebScheme(target)) { setCurrentWebUrl(target); webRef.current?.stopLoading(); webRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(target)};true;`); }
          }}
        />
        {webLoading && <View pointerEvents="none" style={styles.loadingOverlay}><ActivityIndicator size="small" color={BLUE} /><Text style={styles.loadingLabel}>جارٍ فتح المنصة…</Text></View>}
        {!!webError && <View style={styles.webError}><View style={styles.errorCard}><Text style={styles.errorTitle}>ما قدرنا نفتح المنصة</Text><Text style={styles.body}>{webError}</Text><ActionButton title="إعادة المحاولة" onPress={() => { setWebError(''); webRef.current?.reload(); }} />{rollbackUrl && <ActionButton title="الرجوع للرابط السابق" secondary onPress={async () => { const oldUrl = rollbackUrl; setRollbackUrl(null); await patchPrefs({ ...prefs, platformUrl: oldUrl }); setActiveUrl(oldUrl); setUrlInput(oldUrl); setCurrentWebUrl(oldUrl); setWebSourceUrl(oldUrl); setWebError(''); }} />}<ActionButton title="الإعدادات" secondary onPress={() => openSettings('platform')} /></View></View>}
      </View>
      {showToolbar && <View style={styles.toolbar}>
        <Pressable style={styles.toolButton} onPress={() => canGoBack ? webRef.current?.goBack() : router.back()}><Text style={styles.toolIcon}>‹</Text><Text style={styles.toolLabel}>رجوع</Text></Pressable>
        <Pressable style={styles.toolButton} onPress={() => { setWebError(''); webRef.current?.reload(); }}><Text style={styles.toolIcon}>↻</Text><Text style={styles.toolLabel}>تحديث</Text></Pressable>
        <Pressable style={styles.toolButton} onPress={() => openSettings('platform')}><Text style={styles.toolIcon}>⚙</Text><Text style={styles.toolLabel}>الإعدادات</Text></Pressable>
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
  identityContent: { flex: 1, justifyContent: 'center', padding: 22, gap: 24 },
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
  prayerActions: { gap: 4 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: MUTED, fontSize: 13, fontWeight: '700' },
  settingsContent: { padding: 18, paddingBottom: 34 },
  settingsHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  closeButton: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, backgroundColor: PALE },
  closeButtonText: { color: NAVY, fontWeight: '700' },
  sectionTitle: { color: NAVY, fontSize: 17, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
  currentUrl: { color: MUTED, fontSize: 12, textAlign: 'left', marginBottom: 12 },
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
