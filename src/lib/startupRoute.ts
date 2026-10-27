import type { Preferences } from './preferencesModel';

export type StartupRoute = '/identity' | '/prayer';

export function getStartupRoute(preferences: Pick<Preferences, 'identity'>): StartupRoute {
  return preferences.identity ? '/prayer' : '/identity';
}
