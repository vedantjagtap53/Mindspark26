import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCursor,
  applyTheme,
  readCursorPreference,
  readThemeCookie,
  resolveTheme,
  writeCursorPreference,
  writeThemeCookie,
} from '../src/utils/theme';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'ms_theme=; Path=/; Max-Age=0';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-cursor');
  window.localStorage.clear();
});

const mockSystem = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark') }));

describe('theme cookie', () => {
  it('round-trips a valid theme', () => {
    expect(readThemeCookie()).toBeNull();
    writeThemeCookie('dark');
    expect(readThemeCookie()).toBe('dark');
    writeThemeCookie('system');
    expect(readThemeCookie()).toBe('system');
  });

  it('finds the theme cookie wherever it sits among other cookies', () => {
    const read = (cookie: string) => readThemeCookie({ cookie } as Document);
    expect(read('ms_theme=dark')).toBe('dark');
    expect(read('a=1; ms_theme=dark')).toBe('dark');
    expect(read('a=1; ms_theme=light; b=2')).toBe('light');
    expect(read('ms_theme=system; b=2')).toBe('system');
    expect(read('x_ms_theme=dark; ms_theme_other=dark')).toBeNull();
    expect(read('')).toBeNull();
  });

  it('ignores a cookie holding anything but a known theme', () => {
    document.cookie = 'ms_theme=neon; Path=/';
    expect(readThemeCookie()).toBeNull();
    document.cookie = 'ms_theme=%E0%A4%A; Path=/';
    expect(readThemeCookie()).toBeNull();
  });
});

describe('applyTheme', () => {
  it('resolves system to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('sets data-theme and the colour scheme on <html>', () => {
    mockSystem(false);
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('follows the OS when the theme is system', () => {
    mockSystem(true);
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('cursor preference', () => {
  it('marks <html> and remembers the device choice', () => {
    applyCursor(false);
    expect(document.documentElement.getAttribute('data-cursor')).toBe('off');
    applyCursor(true);
    expect(document.documentElement.getAttribute('data-cursor')).toBe('on');

    expect(readCursorPreference()).toBe(true);
    writeCursorPreference(false);
    expect(readCursorPreference()).toBe(false);
  });

  it('defaults to on when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readCursorPreference()).toBe(true);
    expect(() => writeCursorPreference(false)).not.toThrow();
  });
});
