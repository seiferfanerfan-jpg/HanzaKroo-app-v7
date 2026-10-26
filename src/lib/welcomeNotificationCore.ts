import type { Preferences } from './preferencesModel';

export type WelcomeResult = 'posted' | 'denied' | 'unsupported' | 'already-posted' | 'error';

export function isWelcomeEligible(preferences: Pick<Preferences, 'platformUrl' | 'identity' | 'welcomeNotifications'>): boolean {
  return Boolean(preferences.platformUrl && preferences.identity && preferences.welcomeNotifications);
}

type PermissionResult = { granted: boolean; status: string };

type WelcomeDependencies = {
  platform: string;
  ensureChannel: () => Promise<void>;
  getPermission: () => Promise<PermissionResult>;
  requestPermission: () => Promise<PermissionResult>;
  schedule: () => Promise<void>;
};

export function createWelcomePoster(dependencies: WelcomeDependencies): () => Promise<WelcomeResult> {
  let postedThisRun = false;

  return async () => {
    if (postedThisRun) return 'already-posted';
    if (dependencies.platform !== 'android' && dependencies.platform !== 'ios') return 'unsupported';

    try {
      if (dependencies.platform === 'android') await dependencies.ensureChannel();
      let permission = await dependencies.getPermission();
      if (!permission.granted && permission.status === 'undetermined') {
        permission = await dependencies.requestPermission();
      }
      if (!permission.granted) return 'denied';

      await dependencies.schedule();
      postedThisRun = true;
      return 'posted';
    } catch {
      return 'error';
    }
  };
}
