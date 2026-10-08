import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { BRAND_NAME } from '../../constants/brand';

export interface LandingActions {
  /** Opens the simulator without an account. Offered only while sign-in is not enforced. */
  onStart?: () => void;
  /** Opens the sign-in page. With `onRegister`, the home page offers accounts instead of a launch button. */
  onLogin?: () => void;
  /** Opens the create-account page. */
  onRegister?: () => void;
}

/** In-page links in the header; the section ids are set on the sections themselves. */
export const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#products', label: 'Products' },
  { href: '#journey', label: 'Journey' },
] as const;

export function LandingHeader({
  onStart,
  onLogin,
  onRegister,
  userSlot,
  docked = false,
}: LandingActions & {
  userSlot?: ReactNode;
  /** The page has scrolled away from the top: the header tightens and gets a shadow. */
  docked?: boolean;
}) {
  const accounts = Boolean(onLogin && onRegister);
  return (
    <header
      data-docked={docked ? 'true' : 'false'}
      className={`px-6 border-b border-[var(--border-subtle)] bg-[var(--canvas-bg)]/80 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center transition-[padding,box-shadow] duration-[var(--motion-base)] ease-[var(--ease-out)] ${
        docked ? 'py-2 shadow-sm' : 'py-4'
      }`}
    >
      <div className="flex items-center gap-8">
        <span className="font-serif text-xl font-bold tracking-tight text-[var(--ink-primary)]">
          {BRAND_NAME}
        </span>
        <nav aria-label="On this page" className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {userSlot}
        {/* On a phone the hero below shows the same buttons, so the header keeps only the brand and
            the account menu instead of squeezing four controls into one row. */}
        <div className="hidden sm:flex items-center gap-3">
          {accounts ? (
            <>
              <button
                type="button"
                onClick={onLogin}
                className="clay-press px-4 py-2 text-sm font-semibold text-[var(--ink-primary)] border border-[var(--border-strong)] hover:bg-[var(--well-bg)] rounded-full"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="clay-press px-4 py-2 text-sm font-semibold text-white bg-[var(--accent-primary)] rounded-full flex items-center gap-2 shadow-lg"
              >
                Create account <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="clay-press px-4 py-2 text-sm font-semibold text-white bg-[var(--accent-primary)] rounded-full flex items-center gap-2 shadow-lg"
            >
              Launch Simulator <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
