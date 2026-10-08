// One sign-in page for everyone: users and administrators use the same form. The server decides
// the role from the account, and the app then opens the matching screen (the simulator for a user,
// the admin console for an administrator). Registration creates a user; administrator accounts are
// created by an existing administrator.
import { useState, type FormEvent } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { loginRequestSchema, registerRequestSchema } from '@mindspark/shared';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBlock } from '../components/ErrorBlock';
import { UserMenu } from '../components/UserMenu';
import { Field, Tile, TextInput } from '../components/ui';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

const clientError = (path: string, message: string) =>
  new ApiRequestError(400, 'VALIDATION_ERROR', 'Check the details you entered', [
    { path, message },
  ]);

export function AuthPage({
  initialMode = 'login',
  onBack,
}: {
  initialMode?: 'login' | 'register';
  /** Returns to the home page. */
  onBack?: () => void;
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  const registering = mode === 'register';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registering
      ? registerRequestSchema.safeParse({ email, password, displayName })
      : loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(clientError(issue.path.join('.'), issue.message));
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        await register(registerRequestSchema.parse({ email, password, displayName }));
        return;
      }
      await login(email, password);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col antialiased transition-colors duration-200">
      {/* The same soft glows as the landing page. */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-[var(--accent-gold)]/10 blur-[100px] rounded-full pointer-events-none" />

      <header className="relative z-20 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--canvas-bg)]/80 backdrop-blur-md flex items-center justify-between">
        <span className="font-serif text-xl font-bold tracking-tight text-[var(--ink-primary)]">
          FinStrukt
        </span>
        <UserMenu />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-3 pt-4 pb-20">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
              {registering ? 'Create your account' : 'Sign in'}
            </h1>
            <p className="text-sm text-[var(--ink-secondary)] mt-1.5">
              {registering
                ? 'Create an account to run simulations and keep every run saved to it.'
                : 'Users and administrators sign in here.'}
            </p>
          </div>

          {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}

          <Tile>
            <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
              {registering && (
                <Field label="Full name" htmlFor="auth-name">
                  <TextInput
                    id="auth-name"
                    value={displayName}
                    onChange={setDisplayName}
                    autoComplete="name"
                    maxLength={80}
                  />
                </Field>
              )}
              <Field label="Email id" htmlFor="auth-email">
                <TextInput
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="username"
                />
              </Field>
              <Field
                label="Password"
                htmlFor="auth-password"
                hint={
                  registering
                    ? 'At least 10 characters with a lowercase letter, an uppercase letter and a digit.'
                    : undefined
                }
              >
                <TextInput
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={registering ? 'new-password' : 'current-password'}
                />
              </Field>

              <button
                type="submit"
                disabled={busy}
                className="clay-btn-primary w-full px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {registering ? (
                  <UserPlus className="w-4 h-4" aria-hidden />
                ) : (
                  <LogIn className="w-4 h-4" aria-hidden />
                )}
                {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </Tile>

          <p className="text-center text-xs text-[var(--ink-muted)]">
            <button
              type="button"
              onClick={() => {
                setMode(registering ? 'login' : 'register');
                setError(null);
              }}
              className="font-semibold text-[var(--ink-primary)] underline underline-offset-2"
            >
              {registering ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </p>
          {onBack && (
            <p className="text-center">
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-[var(--ink-muted)] underline underline-offset-2"
              >
                Back to home
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
