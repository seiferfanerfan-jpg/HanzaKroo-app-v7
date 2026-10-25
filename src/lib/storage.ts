import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFERENCES, deserializePreferences, type Preferences } from './preferencesModel';

const STORAGE_KEY = '@hanzakro/preferences-v1';

export type { Preferences } from './preferencesModel';
export { DEFAULT_PREFERENCES } from './preferencesModel';

export async function loadPreferences(): Promise<Preferences> {
  try {
    return deserializePreferences(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
