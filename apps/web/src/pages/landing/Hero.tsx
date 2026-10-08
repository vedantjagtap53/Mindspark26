import { ArrowRight } from 'lucide-react';
import { Reveal } from '../../components/Reveal';
import { AmbientGrid } from './AmbientGrid';
import { HERO } from './content';
import { HeroDemo } from './HeroDemo';
import type { LandingActions } from './LandingHeader';

export function Hero({ onStart, onLogin, onRegister }: LandingActions) {
  const accounts = Boolean(onLogin && onRegister);
  return (
    <section className="relative overflow-hidden pt-24 pb-28 flex flex-col items-center justify-center text-center px-4">
      <AmbientGrid />
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-[var(--accent-gold)]/10 blur-[100px] rounded-full pointer-events-none"
      />

      <div className="relative z-10 max-w-4xl mx-auto space-y-8">
        <Reveal>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            {HERO.title}
          </h1>
        </Reveal>
        <Reveal index={1}>
          <p className="text-lg md:text-xl text-[var(--ink-secondary)] max-w-3xl mx-auto font-light leading-relaxed">
            {HERO.intro}
          </p>
        </Reveal>

        <Reveal
          index={2}
          className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          {accounts ? (
            <>
              <button
                type="button"
                onClick={onLogin}
                className="clay-press px-8 py-4 text-lg font-bold text-white bg-[var(--accent-primary)] rounded-full shadow-xl shadow-black/10 flex items-center gap-3"
              >
                Log in <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="clay-press px-8 py-4 text-lg font-bold text-[var(--ink-primary)] border border-[var(--border-strong)] hover:bg-[var(--well-bg)] rounded-full"
              >
                Create account
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="clay-press px-8 py-4 text-lg font-bold text-white bg-[var(--accent-primary)] rounded-full shadow-xl shadow-black/10 flex items-center gap-3"
            >
              Start New Mandate <ArrowRight className="w-5 h-5" aria-hidden />
            </button>
          )}
        </Reveal>

        {accounts && onStart && (
          <p className="text-sm text-[var(--ink-muted)]">
            Sign-in is not enforced on this server.{' '}
            <button
              type="button"
              onClick={onStart}
              className="font-semibold underline underline-offset-2"
            >
              Continue without an account
            </button>
          </p>
        )}

        <p className="text-xs font-mono text-[var(--ink-muted)]">{HERO.notice}</p>

        <Reveal index={3} className="pt-6">
          <HeroDemo />
        </Reveal>
      </div>
    </section>
  );
}
