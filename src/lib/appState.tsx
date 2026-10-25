import * as Notifications from 'expo-notifications';
import * as ScreenOrientation from 'expo-screen-orientation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type Preferences } from './storage';
import { createPreferencesController } from './preferencesController';
import { postWelcomeOnce } from './welcomeNotification';

type AppStateValue = {
  ready: boolean;
  prefs: Preferences;
  patchPrefs: (next: Preferences) => Promise<void>;
  notificationStatus: string;
  activeUrl: string | null;
  setActiveUrl: (url: string | null) => void;
  rollbackUrl: string | null;
  setRollbackUrl: (url: string | null) => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFERENCES);
  const [notificationStatus, setNotificationStatus] = useState('جارٍ الفحص…');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [rollbackUrl, setRollbackUrl] = useState<string | null>(null);
  const notificationStarted = useRef(false);
  const preferencesController = useRef(createPreferencesController(DEFAULT_PREFERENCES, savePreferences));

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
    await postWelcomeOnce();
    await refreshNotificationStatus();
  }, [refreshNotificationStatus]);

  useEffect(() => {
    let active = true;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    loadPreferences().then((loaded) => {
      if (!active) return;
      setPrefs(loaded);
      preferencesController.current.hydrate(loaded);
      setActiveUrl(loaded.platformUrl || null);
      setReady(true);
      void refreshNotificationStatus();
      if (loaded.welcomeNotifications) void postWelcome();
    }).catch(() => {
      if (!active) return;
      preferencesController.current.hydrate(DEFAULT_PREFERENCES);
      setPrefs(DEFAULT_PREFERENCES);
      setActiveUrl(null);
      setReady(true);
      void refreshNotificationStatus();
    });
    return () => { active = false; };
  }, [postWelcome, refreshNotificationStatus]);

  const patchPrefs = useCallback(async (next: Preferences) => {
    const enablingWelcome = next.welcomeNotifications && !prefs.welcomeNotifications;
    const result = await preferencesController.current.patch(next);
    setPrefs(result.current);
    if (result.ok) {
      if (enablingWelcome) void postWelcome();
      return;
    }
    {
      Alert.alert('تعذر الحفظ', 'لم نتمكن من حفظ الإعدادات على هذا الجهاز. حاول مرة أخرى.');
    }
  }, [prefs, postWelcome]);

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
