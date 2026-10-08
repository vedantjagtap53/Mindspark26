// Frame for the pages that are not the simulator (admin console, compliance audit view).
import type { ReactNode } from 'react';
import { BRAND_NAME } from '../constants/brand';
import { UserMenu } from './UserMenu';

interface Props {
  title: string;
  /** Extra header actions, e.g. a button to switch to the simulator. */
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, actions, children }: Props) {
  return (
    <div className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col antialiased transition-colors duration-200">
      <header className="sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--canvas-bg)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <span className="font-serif text-lg font-bold text-[var(--ink-primary)]">
              {BRAND_NAME}
            </span>
            <span className="block text-[11px] font-mono text-[var(--ink-muted)]">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {children}
      </main>
    </div>
  );
}
