import { applyPreferencePatch, type Preferences } from './preferencesModel';

export type PreferenceWriteResult = {
  ok: boolean;
  previous: Preferences;
  requested: Preferences;
  current: Preferences;
};

export function createPreferencesController(initial: Preferences, persist: (preferences: Preferences) => Promise<void>) {
  let current = initial;
  let persisted = initial;
  let queue: Promise<void> = Promise.resolve();
  let version = 0;

  return {
    getCurrent: () => current,
    hydrate: (preferences: Preferences) => {
      current = preferences;
      persisted = preferences;
      queue = Promise.resolve();
      version += 1;
    },
    patch: (patch: Partial<Preferences>): Promise<PreferenceWriteResult> => {
      const previous = current;
      const requested = applyPreferencePatch(previous, patch);
      const requestVersion = ++version;
      current = requested;

      const write = queue.then(() => persist(requested));
      queue = write.then(() => {
        persisted = requested;
      }, () => undefined);

      return write.then(
        () => ({ ok: true, previous, requested, current }),
        () => {
          if (version === requestVersion) current = persisted;
          return { ok: false, previous, requested, current };
        },
      );
    },
  };
}
