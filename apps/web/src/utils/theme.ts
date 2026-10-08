// Theme and cursor preferences. The theme is mirrored in a plain (script-readable) cookie so the
// page can apply it before first paint and so it follows the user across devices once the server
// has set it; for a signed-in user the saved account setting is the source of truth.
import { AUTH_COOKIES, THEMES, type Theme } from '@mindspark/shared';

export type ResolvedTheme = 'light' | 'dark';

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

export function readThemeCookie(doc: Document = document): Theme | null {
  for (const part of doc.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== AUTH_COOKIES.theme) continue;
    try {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return isTheme(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function writeThemeCookie(theme: Theme, doc: Document = document): void {
  const secure = doc.location?.protocol === 'https:' ? '; Secure' : '';
  doc.cookie = `${AUTH_COOKIES.theme}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export const prefersDark = (win: Window = window): boolean =>
  typeof win.matchMedia === 'function' && win.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (theme: Theme, systemDark: boolean): ResolvedTheme =>
  theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

/** Sets `data-theme` on <html> (index.css swaps its colour variables on it). */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  const resolved = resolveTheme(theme, prefersDark());
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

/** index.css only hides the system cursor while `data-cursor` is not `off`. */
export function applyCursor(enabled: boolean, root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-cursor', enabled ? 'on' : 'off');
}

const CURSOR_KEY = 'ms_custom_cursor';

/** Device-local cursor preference for visitors who are not signed in. */
export function readCursorPreference(): boolean {
  try {
    return window.localStorage.getItem(CURSOR_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeCursorPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(CURSOR_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage can be blocked (private mode); the preference then lasts for this page only.
  }
}
