// Account menu: who is signed in, appearance settings (theme, custom cursor) and sign out.
// Visitors who are not signed in (development without enforcement) get the appearance settings
// and a sign-in button; their choices stay on this device.
import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, Settings, UserCircle } from 'lucide-react';
import { THEMES, type Theme, type UserRole } from '@mindspark/shared';
import { useAuth } from '../auth/AuthContext';
import { Segmented } from './ui';

export const ROLE_LABEL: Record<UserRole, string> = {
  RM: 'User',
  ADMIN: 'Administrator',
};

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function UserMenu({ onSignIn }: { onSignIn?: () => void }) {
  const { user, settings, settingsError, setTheme, setCustomCursor, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={user ? `Account menu for ${user.displayName}` : 'Settings'}
        className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5"
      >
        {user ? (
          <UserCircle className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <Settings className="w-3.5 h-3.5" aria-hidden />
        )}
        <span className="max-w-[9rem] truncate">{user ? user.displayName : 'Settings'}</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label="Account and settings"
          className="absolute right-0 mt-2 w-72 p-4 z-30 space-y-4 text-left rounded-[20px] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--ink-primary)] shadow-[var(--shadow-clay)]"
        >
          {user && (
            <div>
              <p className="text-sm font-bold text-[var(--ink-primary)] truncate">
                {user.displayName}
              </p>
              <p className="text-xs font-mono text-[var(--ink-muted)] truncate">{user.email}</p>
              <span className="clay-badge-suitable inline-block mt-1.5 px-2 py-0.5 text-[11px] font-bold rounded-full">
                {ROLE_LABEL[user.role]}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-mono uppercase text-[var(--ink-muted)] font-semibold">
              Appearance
            </p>
            <Segmented
              label="Theme"
              value={settings.theme}
              options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
              onChange={setTheme}
            />
          </div>

          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--ink-primary)] cursor-pointer">
            Custom cursor
            <input
              type="checkbox"
              role="switch"
              checked={settings.customCursor}
              onChange={(e) => setCustomCursor(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent-primary)]"
            />
          </label>

          {settingsError && (
            <p role="alert" className="text-xs text-[var(--status-breach-text)]">
              {settingsError}
            </p>
          )}

          {user ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="clay-btn-secondary w-full px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden />
              Sign out
            </button>
          ) : (
            onSignIn && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignIn();
                }}
                className="clay-btn-primary w-full px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden />
                Sign in
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
