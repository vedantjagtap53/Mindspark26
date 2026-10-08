// Session state for the whole app: who is signed in, and their saved settings (theme, cursor).
// The API is authoritative: the role shown here only decides which screens to offer, the server
// checks every request again.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_USER_SETTINGS,
  hasPermission,
  type AuthUser,
  type Permission,
  type RegisterRequest,
  type Theme,
  type UserSettings,
} from '@mindspark/shared';
import { ApiRequestError, api, setSessionExpiredHandler } from '../api/client';
import {
  applyCursor,
  applyTheme,
  readCursorPreference,
  readThemeCookie,
  writeCursorPreference,
  writeThemeCookie,
} from '../utils/theme';

export interface AuthContextValue {
  status: 'loading' | 'ready';
  /** False when the server lets anonymous visitors use the simulator (development). */
  authRequired: boolean;
  user: AuthUser | null;
  settings: UserSettings;
  /** Set when a setting could not be saved to the account; it still applies on this device. */
  settingsError: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: RegisterRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setCustomCursor: (enabled: boolean) => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

const anonymousSettings = (): UserSettings => ({
  theme: readThemeCookie() ?? DEFAULT_USER_SETTINGS.theme,
  customCursor: readCursorPreference(),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [authRequired, setAuthRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<UserSettings>(anonymousSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Restore the session: the access cookie if still valid, otherwise a silent refresh.
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      let session = await api.auth.me().catch(() => null);
      if (session && !session.user) {
        const refreshed = await api.auth.refresh().then(
          () => true,
          () => false,
        );
        if (refreshed) session = await api.auth.me().catch(() => session);
      }
      if (cancelled) return;
      if (session) {
        setAuthRequired(session.authRequired);
        setUser(session.user);
        if (session.user) {
          setSettings(session.user.settings);
          writeThemeCookie(session.user.settings.theme);
        }
      } else {
        // The API could not be reached: show the sign-in screen rather than a broken app.
        setAuthRequired(true);
      }
      setStatus('ready');
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // A request the API refused as signed-out (and a refresh could not fix) ends the session.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(undefined);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [settings.theme]);

  useEffect(() => applyCursor(settings.customCursor), [settings.customCursor]);

  const startSession = useCallback((next: AuthUser) => {
    setUser(next);
    setSettings(next.settings);
    setSettingsError(null);
    writeThemeCookie(next.settings.theme);
    return next;
  }, []);

  // One sign-in for everyone: the server decides the role, and the app shows the matching screen.
  const login = useCallback(
    async (email: string, password: string) =>
      startSession((await api.auth.login({ email, password })).user),
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterRequest) => startSession((await api.auth.register(input)).user),
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Whatever the server said, this browser no longer treats the user as signed in.
      setUser(null);
      setSettingsError(null);
    }
  }, []);

  const change = useCallback(
    (changes: Partial<UserSettings>) => {
      setSettings((current) => ({ ...current, ...changes }));
      if (changes.theme) writeThemeCookie(changes.theme);
      if (changes.customCursor !== undefined) writeCursorPreference(changes.customCursor);
      if (!user) return;
      setSettingsError(null);
      api.auth.updateSettings(changes).then(
        (res) => setUser(res.user),
        (err: unknown) =>
          setSettingsError(
            err instanceof ApiRequestError
              ? `Could not save your settings: ${err.message}`
              : 'Could not save your settings',
          ),
      );
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      authRequired,
      user,
      settings,
      settingsError,
      login,
      register,
      logout,
      setTheme: (theme) => change({ theme }),
      setCustomCursor: (customCursor) => change({ customCursor }),
      can: (permission) => (user ? hasPermission(user.role, permission) : false),
    }),
    [status, authRequired, user, settings, settingsError, login, register, logout, change],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
