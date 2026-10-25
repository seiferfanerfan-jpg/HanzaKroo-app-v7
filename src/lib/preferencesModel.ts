import type { Identity } from '../data/prayers';
import { normalizePlatformUrl } from './url';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizePreferences(value: unknown): Preferences {
  if (!isRecord(value)) throw new Error('بيانات التفضيلات المخزنة ليست كائنًا صالحًا.');
  const url = typeof value.platformUrl === 'string' ? normalizePlatformUrl(value.platformUrl).value || null : null;
  const identity: Identity | null = value.identity === 'saif' || value.identity === 'hanoun' ? value.identity : null;
  return {
    platformUrl: url,
    identity,
    welcomeNotifications: typeof value.welcomeNotifications === 'boolean' ? value.welcomeNotifications : DEFAULT_PREFERENCES.welcomeNotifications,
    typingSpeed: boundedNumber(value.typingSpeed, DEFAULT_PREFERENCES.typingSpeed, 5, 80),
    prayerFontSize: boundedNumber(value.prayerFontSize, DEFAULT_PREFERENCES.prayerFontSize, 15, 26),
    skipTyping: value.skipTyping === true,
  };
}

export function deserializePreferences(raw: string | null): Preferences {
  if (raw === null) return DEFAULT_PREFERENCES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('ملف التفضيلات المخزّن تالف ولا يمكن قراءته.');
  }
  return normalizePreferences(parsed);
}

export function applyPreferencePatch(current: Preferences, patch: Partial<Preferences>): Preferences {
  return normalizePreferences({ ...current, ...patch });
}
