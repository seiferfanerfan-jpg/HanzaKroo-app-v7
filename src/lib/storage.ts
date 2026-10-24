import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Identity } from '../data/prayers';

const STORAGE_KEY = '@hanzakro/preferences-v1';

export type Preferences = {
  platformUrl: string | null;
  identity: Identity | null;
  welcomeNotifications: boolean;
  typingSpeed: number;
  prayerFontSize: number;
  skipTyping: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  platformUrl: null,
  identity: null,
  welcomeNotifications: true,
  typingSpeed: 24,
  prayerFontSize: 17,
  skipTyping: false,
};

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      platformUrl: typeof stored.platformUrl === 'string' ? stored.platformUrl : null,
      identity: stored.identity === 'saif' || stored.identity === 'hanoun' ? stored.identity : null,
      welcomeNotifications: stored.welcomeNotifications !== false,
      typingSpeed: Math.min(80, Math.max(5, Number(stored.typingSpeed) || 24)),
      prayerFontSize: Math.min(26, Math.max(15, Number(stored.prayerFontSize) || 17)),
      skipTyping: stored.skipTyping === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
