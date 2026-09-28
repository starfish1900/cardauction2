/**
 * Small per-browser settings: the guest token, the nickname, the language, assist mode. Storage
 * can be unavailable (private windows, blocked site data), so every access is guarded and the app
 * works without it.
 */
const PREFIX = 'cardauction.';

export type SettingKey = 'token' | 'nickname' | 'lang' | 'assist';

export function readSetting(key: SettingKey): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: SettingKey, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not available: the setting lasts until the page closes.
  }
}
