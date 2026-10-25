import type { Preferences } from './preferencesModel';

export type StartupRoute = '/setup' | '/identity' | '/prayer';

export function getStartupRoute(preferences: Pick<Preferences, 'platformUrl' | 'identity'>): StartupRoute {
  if (!preferences.platformUrl) return '/setup';
  if (!preferences.identity) return '/identity';
  return '/prayer';
}
