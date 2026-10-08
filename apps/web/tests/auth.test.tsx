// Sign-in, roles, session restore and settings in the browser, against a stubbed API.
// The stub stands in for the backend in tests only.
import { createHash } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_SETTINGS,
  PAYLOAD_HASH_HEADER,
  type ActivityResponse,
  type AdminAnalytics,
  type AuthUser,
  type UserRole,
  type UserSettings,
} from '@mindspark/shared';
import { AppRoot } from '../src/AppRoot';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const noContent = () => Promise.resolve(new Response(null, { status: 204 }));
const errorBody = (code: string, message: string) => ({ error: { code, message } });

const user = (role: UserRole, settings: Partial<UserSettings> = {}): AuthUser => ({
  id: `00000000-0000-4000-8000-00000000000${role.length}`,
  email: `${role.toLowerCase()}@bank.test`,
  displayName: `${role} Person`,
  role,
  settings: { ...DEFAULT_USER_SETTINGS, ...settings },
});

interface World {
  authRequired?: boolean;
  /** Who is signed in when the page loads (access cookie valid). */
  session?: AuthUser | null;
  /** The refresh cookie still works, so a signed-out page can silently sign in again. */
  refreshUser?: AuthUser | null;
  /** Accounts that can sign in with the password below. */
  accounts?: AuthUser[];
}
const PASSWORD = 'Valid-Passw0rd';
const OTHER_ID = '00000000-0000-4000-8000-000000000099';

const adminRows = (self: AuthUser) => [
  { ...self, active: true, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null },
  {
    ...user('RM'),
    id: OTHER_ID,
    active: true,
    createdAt: '2026-10-02T00:00:00.000Z',
    lastLoginAt: '2026-10-05T10:00:00.000Z',
  },
];

const audit = {
  simulations: [
    {
      id: 'a1',
      createdAt: '2026-10-06T10:00:00.000Z',
      user: { id: 'u-asha', email: 'asha@bank.test', displayName: 'Asha Rao' },
      mode: 'B',
      productType: 'ELN',
      underlyingSymbol: '^NSEI',
      currencyPair: null,
      tenorDays: 365,
      notional: 1_000_000,
      terms: { strikePct: 100, barrierPct: 80, underlying: { symbol: '^NSEI' } },
      inputs: {
        levelValue: 25_000,
        levelSource: 'manual',
        shockPct: -25,
        shockedLevel: 18_750,
        trainingWindowYears: null,
      },
      client: {
        riskAppetite: 'medium',
        horizonMonths: 24,
        lossTolerancePct: 10,
        concentrationPct: 15,
      },
      results: [
        {
          scenario: 'shock',
          payoff: 850_000,
          returnPct: -15,
          lossAmount: 150_000,
          knockedIn: true,
        },
      ],
      verdict: 'Caution',
      flags: [{ rule: 'risk_vs_appetite', hard: false, reason: 'High risk product' }],
      explanationCount: 0,
    },
  ],
};

/** The full stored record of run a1, as GET /api/runs/a1 and /api/audit/simulations/a1 return it. */
const savedDetail = {
  ...audit.simulations[0]!,
  explanationCount: 1,
  levelAsOf: null,
  cases: [
    {
      scenario: 'shock',
      percentile: null,
      terminal: 18_750,
      pathMin: null,
      payoff: 850_000,
      returnPct: -15,
      lossAmount: 150_000,
      knockedIn: true,
    },
  ],
  distribution: null,
  forecast: null,
  rulesVersion: '2026-10-04',
  assessedAt: '2026-10-06T10:00:01.000Z',
  explanations: [
    {
      createdAt: '2026-10-06T10:01:00.000Z',
      text: 'The barrier was breached, so the note repays less than invested.',
      model: 'test-model',
      sources: ['eln.md'],
    },
  ],
};

const analytics: AdminAnalytics = {
  generatedAt: '2026-10-08T09:00:00.000Z',
  windowDays: 30,
  totals: {
    users: 4,
    activeUsers: 3,
    admins: 1,
    runsAllTime: 12,
    runsInWindow: 9,
    runsLast7Days: 5,
    loginsLast7Days: 8,
    failedLoginsLast7Days: 2,
  },
  daily: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 9 + i)).toISOString().slice(0, 10),
    runs: i % 3,
    logins: i % 2,
  })),
  byProduct: [
    { product: 'ELN', runs: 6 },
    { product: 'DCD', runs: 3 },
  ],
  byMode: [
    { mode: 'B', runs: 7 },
    { mode: 'A', runs: 2 },
  ],
  verdicts: [
    { verdict: 'Suitable', count: 4 },
    { verdict: 'Caution', count: 4 },
    { verdict: null, count: 1 },
  ],
  topUsers: [
    {
      user: { id: 'u-asha', email: 'asha@bank.test', displayName: 'Asha Rao' },
      runs: 6,
      lastRunAt: '2026-10-07T10:00:00.000Z',
      lastLoginAt: '2026-10-07T09:00:00.000Z',
    },
  ],
  truncated: false,
};

const activity: ActivityResponse = {
  events: [
    {
      id: 'e1',
      createdAt: '2026-10-08T08:00:00.000Z',
      event: 'LOGIN_FAILED',
      user: null,
      actorEmail: 'ghost@bank.test',
      detail: { reason: 'unknown_email' },
    },
    {
      id: 'e2',
      createdAt: '2026-10-08T07:00:00.000Z',
      event: 'RUN_SAVED',
      user: { id: 'u-asha', email: 'asha@bank.test', displayName: 'Asha Rao' },
      actorEmail: null,
      detail: { product: 'ELN', mode: 'B', verdict: 'Caution' },
    },
    {
      id: 'e3',
      createdAt: '2026-10-08T06:00:00.000Z',
      event: 'ROLE_CHANGED',
      user: { id: 'u-ravi', email: 'ravi@bank.test', displayName: 'Ravi Menon' },
      actorEmail: 'ravi@bank.test',
      detail: { from: 'RM', to: 'ADMIN' },
    },
  ],
};

function backend(world: World = {}) {
  const w = { authRequired: true, session: null, refreshUser: null, accounts: [], ...world };
  let current: AuthUser | null = w.session;
  const calls: Array<{ method: string; url: string; body: unknown; headers: Headers }> = [];

  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = (init.body ? JSON.parse(init.body as string) : {}) as {
      email: string;
      password: string;
      displayName: string;
      role: string;
    };
    calls.push({ method, url, body, headers: new Headers(init.headers) });

    if (url === '/api/auth/me') return json(200, { authRequired: w.authRequired, user: current });
    if (url === '/api/auth/refresh') {
      if (!w.refreshUser) return json(401, errorBody('UNAUTHENTICATED', 'Session expired'));
      current = w.refreshUser;
      return json(200, { user: current });
    }
    if (url === '/api/auth/login') {
      const found = w.accounts.find((a) => a.email === body.email);
      if (!found || body.password !== PASSWORD) {
        return json(401, errorBody('UNAUTHENTICATED', 'Incorrect email or password'));
      }
      current = found;
      return json(200, { user: found });
    }
    if (url === '/api/auth/register') {
      current = { ...user('RM'), email: body.email, displayName: body.displayName };
      return json(201, { user: current });
    }
    if (url === '/api/auth/logout') {
      current = null;
      return noContent();
    }
    if (url === '/api/auth/settings') {
      current = { ...current!, settings: { ...current!.settings, ...body } };
      return json(200, { user: current });
    }
    if (url === '/api/admin/users' && method === 'GET') {
      return json(200, { users: adminRows(current!) });
    }
    if (url.startsWith('/api/admin/users/') && method === 'PUT') {
      const row = adminRows(current!).find((r) => url.endsWith(r.id))!;
      return json(200, { user: { ...row, ...body } });
    }
    if (url === '/api/admin/users' && method === 'POST') {
      return json(201, {
        user: {
          ...user(body.role as UserRole),
          email: body.email,
          displayName: body.displayName,
          active: true,
          createdAt: '2026-10-07T00:00:00.000Z',
          lastLoginAt: null,
        },
      });
    }
    if (url === '/api/audit/simulations') return json(200, audit);
    if (url === '/api/audit/simulations/a1' || url === '/api/runs/a1') {
      return json(200, { run: savedDetail });
    }
    if (url === '/api/admin/analytics') return json(200, analytics);
    if (url.startsWith('/api/admin/activity')) return json(200, activity);
    if (url.startsWith('/api/runs')) return json(200, { runs: audit.simulations });
    return json(404, errorBody('NOT_FOUND', url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, called: (url: string) => calls.filter((c) => c.url === url) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'ms_theme=; Path=/; Max-Age=0';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-cursor');
  window.localStorage.clear();
});

// A signed-out visitor starts on the home page and opens sign-in or registration from it.
const openLogin = async () => {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Log in' }))[0]!);
  await screen.findByRole('heading', { name: 'Sign in' });
};
const openRegister = async () => {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Create account' }))[0]!);
  await screen.findByRole('heading', { name: 'Create your account' });
};

const signInAs = (email: string, password = PASSWORD) => {
  fireEvent.change(screen.getByLabelText('Email id'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};
// A signed-in user goes straight to the main interface (the mandate stage), not the home page.
const startButton = () => screen.findAllByRole('heading', { name: /Capture the client mandate/ });

describe('signing in', () => {
  it('opens on the home page with Log in and Create account when nobody is signed in', async () => {
    backend();
    render(<AppRoot />);
    expect((await screen.findAllByRole('button', { name: 'Log in' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Create account' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /Capture the client mandate/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue without an account/ })).toBeNull();
  });

  it('shows one sign-in page for everyone, with no role to choose', async () => {
    backend();
    render(<AppRoot />);
    await openLogin();
    expect(screen.getByLabelText('Email id')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(/Compliance/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Start New Mandate/ })).toBeNull();
  });

  it('fails closed to the home page, with no way into the simulator, when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    render(<AppRoot />);
    expect((await screen.findAllByRole('button', { name: 'Log in' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Continue without an account/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Capture the client mandate/ })).toBeNull();
  });

  it('signs an RM in and opens the simulator, sending a payload hash with the credentials', async () => {
    const { called } = backend({ accounts: [user('RM')] });
    render(<AppRoot />);
    await openLogin();
    signInAs('rm@bank.test');

    expect((await startButton()).length).toBeGreaterThan(0);
    const [login] = called('/api/auth/login');
    expect(login!.body).toEqual({ email: 'rm@bank.test', password: PASSWORD });
    expect(login!.headers.get(PAYLOAD_HASH_HEADER)).toBe(
      createHash('sha256').update(JSON.stringify(login!.body)).digest('hex'),
    );
  });

  it('shows the server error for a wrong password and stays on the sign-in page', async () => {
    backend({ accounts: [user('RM')] });
    render(<AppRoot />);
    await openLogin();
    signInAs('rm@bank.test', 'Wrong-Passw0rd');
    expect(await screen.findByText('Incorrect email or password')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('checks the form before calling the API', async () => {
    const { called } = backend();
    render(<AppRoot />);
    await openLogin();
    signInAs('not-an-email');
    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(called('/api/auth/login')).toHaveLength(0);
  });
});

describe('registering', () => {
  it('is one link away on the sign-in page, and back again', async () => {
    backend();
    render(<AppRoot />);
    await openLogin();
    fireEvent.click(screen.getByRole('button', { name: /New here\? Create an account/ }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Already have an account/ }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('opens straight on the registration form from the home page', async () => {
    backend();
    render(<AppRoot />);
    await openRegister();
    expect(screen.getByLabelText('Full name')).toBeTruthy();
    expect(screen.getByLabelText('Email id')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect((await screen.findAllByRole('button', { name: 'Log in' })).length).toBeGreaterThan(0);
  });

  it('creates an RM account and opens the simulator; the request names no role', async () => {
    const { called } = backend();
    render(<AppRoot />);
    await openRegister();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('Email id'), { target: { value: 'asha@bank.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect((await startButton()).length).toBeGreaterThan(0);
    expect(called('/api/auth/register')[0]!.body).toEqual({
      email: 'asha@bank.test',
      password: PASSWORD,
      displayName: 'Asha Rao',
    });
  });

  it('rejects a weak password without calling the API', async () => {
    const { called } = backend();
    render(<AppRoot />);
    await openRegister();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('Email id'), { target: { value: 'asha@bank.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/Password must be at least 10 characters/)).toBeTruthy();
    expect(called('/api/auth/register')).toHaveLength(0);
  });
});

describe('role based screens', () => {
  it('opens the admin console for an administrator who signs in on the same page', async () => {
    backend({ accounts: [user('ADMIN')] });
    render(<AppRoot />);
    await openLogin();
    signInAs('admin@bank.test');

    expect(await screen.findByText('Runs and sign-ins per day')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Capture the client mandate/ })).toBeNull();
  });

  it('opens the simulator, not the console, for a user', async () => {
    backend({ accounts: [user('RM')] });
    render(<AppRoot />);
    await openLogin();
    signInAs('rm@bank.test');

    expect((await startButton()).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radiogroup', { name: 'Admin sections' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Admin console/ })).toBeNull();
  });

  it('gives an Admin a way to the simulator and back to the console', async () => {
    backend({ accounts: [user('ADMIN')] });
    render(<AppRoot />);
    await openLogin();
    signInAs('admin@bank.test');

    await screen.findByText('Runs and sign-ins per day');
    fireEvent.click(screen.getByRole('button', { name: 'Open simulator' }));
    expect((await startButton()).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Admin console' }));
    expect(await screen.findByText('Runs and sign-ins per day')).toBeTruthy();
  });
});

describe('saved runs for a user', () => {
  it('lists the runs saved to their own account in the Runs window', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    await startButton();
    fireEvent.click(screen.getByRole('button', { name: /Runs/ }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Saved' }));

    const table = await screen.findByRole('table', { name: /Your saved runs/ });
    expect(within(table).getByText('ELN · Mode B')).toBeTruthy();
    expect(within(table).getByText('Caution')).toBeTruthy();
    expect(called('/api/runs?limit=50')).toHaveLength(1);
    // The user's own list has no account column: it is only their runs.
    expect(within(table).queryByText('asha@bank.test')).toBeNull();
  });

  it('opens the full stored record of a saved run from their own route', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    await startButton();
    fireEvent.click(screen.getByRole('button', { name: /Runs/ }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Saved' }));
    const table = await screen.findByRole('table', { name: /Your saved runs/ });
    fireEvent.click(within(table).getByRole('button', { name: /Open the ELN run/ }));

    const record = await screen.findByRole('dialog', { name: 'Saved run record' });
    expect(await within(record).findByText('VERDICT: Caution')).toBeTruthy();
    expect(within(record).getByText('High risk product')).toBeTruthy();
    expect(within(record).getByText(/Rules version 2026-10-04/)).toBeTruthy();
    expect(within(record).getByText(/The barrier was breached/)).toBeTruthy();
    expect(within(record).getByText('Knocked in')).toBeTruthy();
    expect(called('/api/runs/a1')).toHaveLength(1);
    expect(called('/api/audit/simulations/a1')).toHaveLength(0);
    // A user's own record does not name the account.
    expect(within(record).queryByText(/Run by/)).toBeNull();
    // Escape closes the record and leaves the Runs window open under it.
    fireEvent.keyDown(record, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Saved run record' })).toBeNull();
    expect(screen.getByRole('table', { name: /Your saved runs/ })).toBeTruthy();
  });
});

describe('admin console', () => {
  const adminWorld = () => {
    const admin = user('ADMIN');
    return backend({ session: admin, accounts: [admin] });
  };
  const open = async (section: string) =>
    fireEvent.click(await screen.findByRole('radio', { name: section }));

  it('starts on the overview with the numbers and charts', async () => {
    adminWorld();
    render(<AppRoot />);
    expect(await screen.findByText('Runs and sign-ins per day')).toBeTruthy();
    expect(screen.getAllByText('Runs saved').length).toBeGreaterThan(0); // metric and chart legend
    expect(screen.getByText('12')).toBeTruthy(); // runs, all time
    expect(screen.getByRole('img', { name: /Runs and sign-ins per day/ })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Runs by product' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Runs by verdict' })).toBeTruthy();
    const top = screen.getByRole('table', { name: 'Most active accounts' });
    expect(within(top).getByText('asha@bank.test')).toBeTruthy();
  });

  it('shows the activity log and filters it', async () => {
    adminWorld();
    render(<AppRoot />);
    await open('Activity log');
    const table = await screen.findByRole('table', { name: /Recent activity/ });
    expect(within(table).getByText('Failed sign-in')).toBeTruthy();
    expect(within(table).getByText('ghost@bank.test')).toBeTruthy();
    expect(within(table).getByText('no account with this email')).toBeTruthy();
    expect(within(table).getByText('ELN · Mode B · Caution')).toBeTruthy();
    expect(within(table).getByText('RM → ADMIN')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Runs' }));
    const runs = screen.getByRole('table', { name: /Recent activity/ });
    expect(within(runs).queryByText('Failed sign-in')).toBeNull();
    expect(within(runs).getByText('Run saved')).toBeTruthy();
  });

  it("shows every account's runs, each with its owner", async () => {
    adminWorld();
    render(<AppRoot />);
    await open('All runs');
    const table = await screen.findByRole('table', { name: /Recorded simulations/ });
    expect(within(table).getByText('asha@bank.test')).toBeTruthy();
    expect(within(table).getByText('Caution')).toBeTruthy();
  });

  it("opens any account's saved run through the admin route, naming who ran it", async () => {
    const { called } = adminWorld();
    render(<AppRoot />);
    await open('All runs');
    const table = await screen.findByRole('table', { name: /Recorded simulations/ });
    fireEvent.click(within(table).getByRole('button', { name: /Open the ELN run/ }));

    const record = await screen.findByRole('dialog', { name: 'Saved run record' });
    expect(await within(record).findByText(/Run by: Asha Rao \(asha@bank.test\)/)).toBeTruthy();
    expect(called('/api/audit/simulations/a1')).toHaveLength(1);
    fireEvent.click(within(record).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Saved run record' })).toBeNull();
  });

  it('lists users, locks the admin own row and changes another user role', async () => {
    const { called } = adminWorld();
    render(<AppRoot />);
    await open('Users');
    const table = await screen.findByRole('table', { name: /Users and their roles/ });
    const own = within(table).getByLabelText<HTMLSelectElement>('Role for admin@bank.test');
    expect(own.disabled).toBe(true);
    const deactivateSelf = within(table).getByLabelText<HTMLButtonElement>(
      'Deactivate admin@bank.test',
    );
    expect(deactivateSelf.disabled).toBe(true);

    const other = within(table).getByLabelText<HTMLSelectElement>('Role for rm@bank.test');
    fireEvent.change(other, { target: { value: 'ADMIN' } });
    const path = `/api/admin/users/${OTHER_ID}`;
    await waitFor(() => expect(called(path)).toHaveLength(1));
    expect(called(path)[0]!.body).toEqual({ role: 'ADMIN' });
    await waitFor(() => {
      const select = within(table).getByLabelText<HTMLSelectElement>('Role for rm@bank.test');
      expect(select.value).toBe('ADMIN');
    });
  });

  it('shows the API refusal when a change is not allowed', async () => {
    const { fetchMock } = adminWorld();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: RequestInit = {}) =>
      url.startsWith('/api/admin/users/') && init.method === 'PUT'
        ? json(409, errorBody('CONFLICT', 'There must be at least one active admin'))
        : original(url, init),
    );
    render(<AppRoot />);
    await open('Users');
    const table = await screen.findByRole('table', { name: /Users and their roles/ });
    fireEvent.click(within(table).getByLabelText('Deactivate rm@bank.test'));
    expect(await screen.findByText('There must be at least one active admin')).toBeTruthy();
  });

  it('creates a user with the chosen role', async () => {
    const { called } = adminWorld();
    render(<AppRoot />);
    await open('Users');
    await screen.findByText('Create a user');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Chandra C' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'chandra@bank.test' } });
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole('radio', { name: 'Administrator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText(/chandra@bank.test was created as Administrator/)).toBeTruthy();
    expect(called('/api/admin/users').find((c) => c.method === 'POST')!.body).toEqual({
      email: 'chandra@bank.test',
      password: PASSWORD,
      displayName: 'Chandra C',
      role: 'ADMIN',
    });
  });
});

describe('session restore and sign out', () => {
  it('goes straight to the user screen when the access cookie is still valid', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    expect((await startButton()).length).toBeGreaterThan(0);
    expect(called('/api/auth/refresh')).toHaveLength(0);
  });

  it('signs back in silently with the refresh cookie when the access cookie has expired', async () => {
    const { called } = backend({ session: null, refreshUser: user('ADMIN') });
    render(<AppRoot />);
    expect(await screen.findByText('Runs and sign-ins per day')).toBeTruthy();
    expect(called('/api/auth/refresh')).toHaveLength(1);
  });

  it('signs out from the account menu', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    await startButton();
    fireEvent.click(screen.getByRole('button', { name: /Account menu for RM Person/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect((await screen.findAllByRole('button', { name: 'Log in' })).length).toBeGreaterThan(0);
    expect(called('/api/auth/logout')).toHaveLength(1);
  });

  it('offers a way in without an account only when sign-in is not enforced', async () => {
    backend({ authRequired: false });
    render(<AppRoot />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue without an account' }));
    expect((await startButton()).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect((await screen.findAllByRole('button', { name: 'Log in' })).length).toBeGreaterThan(0);
  });
});

describe('settings: dark mode and cursor', () => {
  const openMenu = async () => {
    await startButton();
    fireEvent.click(screen.getByRole('button', { name: /Account menu for RM Person/ }));
  };

  it('applies the saved theme of the account when the page loads', async () => {
    backend({ session: user('RM', { theme: 'dark' }) });
    render(<AppRoot />);
    await startButton();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('ms_theme=dark');
  });

  it('switches to dark at once, remembers it in the cookie and saves it to the account', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    await openMenu();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('ms_theme=dark');
    await waitFor(() => expect(called('/api/auth/settings')).toHaveLength(1));
    const [save] = called('/api/auth/settings');
    expect(save!.body).toEqual({ theme: 'dark' });
    expect(save!.headers.get(PAYLOAD_HASH_HEADER)).toMatch(/^[0-9a-f]{64}$/);

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('turns the custom cursor off and saves the choice', async () => {
    const { called } = backend({ session: user('RM') });
    render(<AppRoot />);
    await openMenu();
    fireEvent.click(screen.getByRole('switch', { name: 'Custom cursor' }));
    expect(document.documentElement.getAttribute('data-cursor')).toBe('off');
    await waitFor(() => expect(called('/api/auth/settings')).toHaveLength(1));
    expect(called('/api/auth/settings')[0]!.body).toEqual({ customCursor: false });
  });

  it('keeps the setting on this device and says so when saving to the account fails', async () => {
    const { fetchMock } = backend({ session: user('RM') });
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init: RequestInit = {}) =>
      url === '/api/auth/settings'
        ? json(503, errorBody('DATABASE_ERROR', 'The database is unavailable'))
        : original(url, init),
    );
    render(<AppRoot />);
    await openMenu();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(await screen.findByText(/Could not save your settings/)).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('works without an account: the choice lives in the cookie', async () => {
    backend({ authRequired: false });
    render(<AppRoot />);
    // The home page has the settings menu too, so the theme can be chosen before logging in.
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('ms_theme=dark');
  });
});
