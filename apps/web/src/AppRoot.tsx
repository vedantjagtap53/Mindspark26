// Entry point: restores the session, then shows the right screen for who is signed in.
//   not signed in                         → home page with Log in / Create account (then the sign-in form)
//                                           and, only while sign-in is not enforced, "Continue without an account"
//   User (RM)                             → straight to the simulator (App), skipping the home page
//   Admin                                 → admin console (overview, activity, runs, users), with a
//                                           switch to the simulator
// This only chooses what to offer; the API checks the role again on every request.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { App } from './App';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { CustomCursor } from './components/CustomCursor';
import { UserMenu } from './components/UserMenu';
import { MotionProvider } from './motion';
import { AdminConsole } from './pages/AdminConsole';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';

/**
 * Everything a signed-out visitor sees: the home page, then sign in or create an account. It holds
 * its own state, so signing out remounts it on the home page.
 */
function SignedOut({ authRequired }: { authRequired: boolean }) {
  const [view, setView] = useState<'home' | 'login' | 'register'>('home');
  const [guest, setGuest] = useState(false);

  // Development without enforcement: the simulator can be opened without an account.
  if (guest && !authRequired) {
    return (
      <App
        startOnDesk
        userSlot={
          <UserMenu
            onSignIn={() => {
              setGuest(false);
              setView('login');
            }}
          />
        }
      />
    );
  }
  if (view === 'home') {
    return (
      <LandingPage
        onLogin={() => setView('login')}
        onRegister={() => setView('register')}
        onStart={authRequired ? undefined : () => setGuest(true)}
        userSlot={<UserMenu />}
      />
    );
  }
  return <AuthPage key={view} initialMode={view} onBack={() => setView('home')} />;
}

function Router() {
  const { status, authRequired, user } = useAuth();
  const [adminView, setAdminView] = useState<'admin' | 'desk'>('admin');
  if (status === 'loading') {
    return (
      <div
        role="status"
        className="min-h-screen bg-[var(--canvas-bg)] text-[var(--ink-muted)] flex items-center justify-center gap-2 text-sm"
      >
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Loading your session…
      </div>
    );
  }

  if (!user) return <SignedOut authRequired={authRequired} />;

  if (user.role === 'ADMIN') {
    if (adminView === 'desk') {
      return (
        <App
          startOnDesk
          savedRuns
          userSlot={
            <>
              <button
                type="button"
                onClick={() => setAdminView('admin')}
                className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold"
              >
                Admin console
              </button>
              <UserMenu />
            </>
          }
        />
      );
    }
    return (
      <AppShell
        title="Administration"
        actions={
          <button
            type="button"
            onClick={() => setAdminView('desk')}
            className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold"
          >
            Open simulator
          </button>
        }
      >
        <AdminConsole />
      </AppShell>
    );
  }

  return <App startOnDesk savedRuns userSlot={<UserMenu />} />;
}

/** One cursor for every screen; it follows the user's "Custom cursor" setting. */
function Cursor() {
  const { settings } = useAuth();
  return settings.customCursor ? <CustomCursor /> : null;
}

export function AppRoot() {
  return (
    <MotionProvider>
      <AuthProvider>
        <Cursor />
        <Router />
      </AuthProvider>
    </MotionProvider>
  );
}
