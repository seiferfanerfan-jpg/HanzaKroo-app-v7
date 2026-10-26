import * as Notifications from 'expo-notifications';
import * as ScreenOrientation from 'expo-screen-orientation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_PREFERENCES, type Preferences } from './preferencesModel';
import { createPreferencesController } from './preferencesController';
import { isWelcomeEligible } from './welcomeNotificationCore';
import { loadPreferences, savePreferences } from './storage';
import { postWelcomeOnce } from './welcomeNotification';

type AppStateValue = {
  ready: boolean;
  prefs: Preferences;
  patchPrefs: (patch: Partial<Preferences>) => Promise<boolean>;
  notificationStatus: string;
  activeUrl: string | null;
  setActiveUrl: (url: string | null) => void;
  rollbackUrl: string | null;
  setRollbackUrl: (url: string | null) => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

type PreferencesController = ReturnType<typeof createPreferencesController>;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFERENCES);
  const [notificationStatus, setNotificationStatus] = useState('جارٍ الفحص…');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [rollbackUrl, setRollbackUrl] = useState<string | null>(null);
  const notificationStarted = useRef(false);
  const welcomeEnabledRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const preferencesControllerRef = useRef<PreferencesController | null>(null);
  if (preferencesControllerRef.current === null) {
    preferencesControllerRef.current = createPreferencesController(DEFAULT_PREFERENCES, savePreferences);
  }

  const refreshNotificationStatus = useCallback(async () => {
    try {
      const permission = await Notifications.getPermissionsAsync();
      setNotificationStatus(permission.granted ? 'الإذن مسموح' : permission.canAskAgain ? 'لم يُمنح الإذن بعد' : 'الإذن مرفوض من إعدادات الجهاز');
    } catch {
      setNotificationStatus('حالة الإذن غير متاحة');
    }
  }, []);

  const postWelcome = useCallback(async () => {
    if (notificationStarted.current) return;
    notificationStarted.current = true;
    const result = await postWelcomeOnce();
    await refreshNotificationStatus();
    if (result === 'error') setNotificationStatus('تعذر جدولة إشعار الترحيب؛ راجع إعدادات الجهاز وحاول لاحقًا.');
    if (result !== 'posted' && result !== 'already-posted') notificationStarted.current = false;
  }, [refreshNotificationStatus]);

  useEffect(() => {
    let active = true;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    loadPreferences().then((loaded) => {
      if (!active) return;
      preferencesControllerRef.current?.hydrate(loaded);
      welcomeEnabledRef.current = loaded.welcomeNotifications;
      setupCompleteRef.current = Boolean(loaded.platformUrl && loaded.identity);
      setPrefs(loaded);
      setActiveUrl(loaded.platformUrl || null);
      setReady(true);
      void refreshNotificationStatus();
      if (isWelcomeEligible(loaded)) void postWelcome();
    }).catch(() => {
      if (!active) return;
      preferencesControllerRef.current?.hydrate(DEFAULT_PREFERENCES);
      welcomeEnabledRef.current = false;
      setupCompleteRef.current = false;
      setPrefs(DEFAULT_PREFERENCES);
      setActiveUrl(null);
      setReady(true);
      Alert.alert('تعذر قراءة الإعدادات', 'لم نتمكن من قراءة بيانات التطبيق على هذا الجهاز. يمكنك المتابعة، لكن احفظ الرابط والتفضيلات مجددًا بعد فحص مساحة التخزين.');
      void refreshNotificationStatus();
    });
    return () => { active = false; };
  }, [postWelcome, refreshNotificationStatus]);

  const patchPrefs = useCallback(async (patch: Partial<Preferences>): Promise<boolean> => {
    const result = await preferencesControllerRef.current!.patch(patch);
    setPrefs(result.current);
    if (!result.ok) {
      Alert.alert('تعذر الحفظ', 'لم نتمكن من حفظ الإعدادات على هذا الجهاز. أعد المحاولة؛ لم يُعتمد التغيير غير المحفوظ.');
      return false;
    }

    const wasWelcomeEnabled = welcomeEnabledRef.current;
    const wasSetupComplete = setupCompleteRef.current;
    welcomeEnabledRef.current = result.current.welcomeNotifications;
    setupCompleteRef.current = Boolean(result.current.platformUrl && result.current.identity);
    const newlyConfigured = !wasSetupComplete && setupCompleteRef.current;
    const newlyEnabled = !wasWelcomeEnabled && result.current.welcomeNotifications;
    if (isWelcomeEligible(result.current) && (newlyConfigured || newlyEnabled)) {
      void postWelcome();
    }
    return true;
  }, [postWelcome]);

  return (
    <AppStateContext.Provider value={{ ready, prefs, patchPrefs, notificationStatus, activeUrl, setActiveUrl, rollbackUrl, setRollbackUrl }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside AppStateProvider');
  return context;
}
