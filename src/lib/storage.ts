import AsyncStorage from '@react-native-async-storage/async-storage';
import { deserializePreferences, type Preferences } from './preferencesModel';

const STORAGE_KEY = '@hanzakro/preferences-v1';

export { DEFAULT_PREFERENCES, type Preferences } from './preferencesModel';

export async function loadPreferences(): Promise<Preferences> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return deserializePreferences(raw);
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
