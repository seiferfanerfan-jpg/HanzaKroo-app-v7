export function normalizePlatformUrl(input: string): { value?: string; error?: string } {
  const value = input.trim();
  if (!value) return { error: 'اكتب رابط المنصة أولًا.' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'الرابط غير مكتمل. اكتب عنوانًا يبدأ بـ https://.' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'لأمان حسابك، استخدم رابطًا يبدأ بـ https://.' };
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { error: 'الرابط غير صالح أو يحتوي بيانات دخول غير مسموح بها.' };
  }
  return { value: parsed.toString() };
}

export function isWebScheme(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !!parsed.hostname;
  } catch {
    return false;
  }
}

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
