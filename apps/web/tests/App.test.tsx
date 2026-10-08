// Journey tests with a stubbed API. The stub stands in for the backend in tests only.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type ExplainResponse,
  type ShockOutcome,
  type SimulateModeBResponse,
  type SuitabilityResponse,
} from '@mindspark/shared';
import { App } from '../src/App';
import { preloadLanding } from '../src/pages/LandingPage';

const outcome = (shockPct: number): ShockOutcome => ({
  shockPct,
  level: 25_000 * (1 + shockPct / 100),
  payoff: 1_000_000,
  returnPct: 0,
  lossAmount: 0,
  knockedIn: false,
});

const modeB: SimulateModeBResponse = {
  simulationId: 'sim-1',
  mode: 'B',
  productType: 'ELN',
  level: { value: 25_000, source: 'manual', asOf: null },
  shock: { pct: -10, shockedLevel: 22_500 },
  result: {
    payoff: 1_047_500,
    returnPct: 4.75,
    lossAmount: 0,
    knockedIn: false,
    details: {},
  },
  curve: PAYOFF_CURVE_SHOCKS.map(outcome),
  scenarios: SCENARIO_SHOCKS.map(outcome),
  breakevens: [{ shockPct: -20, level: 20_000 }],
};

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

const suitability: SuitabilityResponse = {
  simulationId: 'sim-1',
  verdict: 'Caution',
  flags: [
    {
      rule: 'risk_vs_appetite',
      severity: 'caution',
      message: "ELN is rated High risk; the client's risk appetite is medium",
    },
  ],
  lowCase: { label: '-25% shock', returnPct: -3, knockedIn: false },
  productRiskRating: 'High',
  persisted: false,
};

const explanation: ExplainResponse = {
  simulationId: 'sim-1',
  verdict: 'Caution',
  sections: {
    whatItIs: 'An equity linked note pays a fixed coupon.',
    bestCase: 'The client gets the notional back plus the coupon.',
    worstCase: 'In the worst case shown the client loses 3%.',
    lossTriggers: 'A fall below the barrier at maturity.',
    suitabilityReasoning: 'Caution, because the product is rated High risk.',
  },
  riskNotice: 'Scenario simulation, not a guarantee.',
  checksPassed: true,
  ungroundedNumbers: [],
  sources: ['eln.md'],
  model: 'gemini-2.5-flash',
};

/** Routes the stubbed API by path, recording each request body. */
function backend() {
  const bodies: Record<string, unknown[]> = {};
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    if (init?.body) (bodies[url] ??= []).push(JSON.parse(init.body as string));
    if (url === '/api/simulate') return json(200, modeB);
    if (url === '/api/suitability') return json(200, suitability);
    if (url === '/api/explain') return json(200, explanation);
    if (url === '/api/chat') {
      return json(200, {
        simulationId: 'sim-1',
        answer: 'The barrier is 80% of the starting level.',
        scope: 'in_scope',
        checksPassed: true,
        riskNote: 'Scenario simulation, not a guarantee.',
        sources: [],
        model: 'gemini-2.5-flash',
      });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: url } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, bodies };
}

async function runModeB() {
  goToSimulate();
  fireEvent.change(screen.getByLabelText(/Starting level \(S/), { target: { value: '25000' } });
  fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
  expect(await screen.findByText('₹10,47,500')).toBeTruthy();
}

/** Stands in for the browser WebSocket to /api/live. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  cleanup();
  vi.unstubAllGlobals();
});

// The landing page loads on demand in the app; load it once up front so these journeys can start from
// its button without waiting.
beforeAll(preloadLanding);

/** The app opens on the landing page; every journey starts from its button. */
function renderApp() {
  render(<App />);
  fireEvent.click(screen.getAllByRole('button', { name: /Start New Mandate/ })[0]!);
}

const goToSimulate = () => fireEvent.click(screen.getByRole('button', { name: /3\. Simulate/ }));

describe('Payoff Desk journey', () => {
  it('opens on the landing page and enters the journey from it', () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: /Capture the client mandate/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Start New Mandate/ })[0]!);
    expect(screen.getByRole('heading', { name: /Capture the client mandate/ })).toBeTruthy();
  });

  it('starts on the mandate stage with the verdict marked pending', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /Capture the client mandate/ })).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('runs Mode B with a manual level and shows the backend payoff', async () => {
    const { fetchMock } = backend();
    renderApp();
    goToSimulate();

    const run = screen.getByRole('button', { name: /Run simulation/ });
    expect((run as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Starting level \(S/), { target: { value: '25000' } });
    fireEvent.click(run);

    expect(await screen.findByText('₹10,47,500')).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([u]) => u === '/api/simulate') as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toMatchObject({
      mode: 'B',
      productType: 'ELN',
      level: { source: 'manual', value: 25_000 },
    });

    fireEvent.click(screen.getByRole('button', { name: /4\. Payoffs/ }));
    expect(screen.getByRole('table', { name: /scenario shock/ })).toBeTruthy();
    // The breakeven comes from the backend, not from an estimate in the browser.
    expect(screen.getByText(/Breakeven -20\.0% \(20,000\.00\)/)).toBeTruthy();
  });

  it('gets the verdict, an explanation and chat answers from the backend', async () => {
    const { bodies } = backend();
    renderApp();
    await runModeB();

    // The verdict is requested with the client snapshot and rule fields.
    await waitFor(() =>
      expect(bodies['/api/suitability']).toEqual([
        {
          simulationId: 'sim-1',
          profile: {
            riskAppetite: 'medium',
            horizonMonths: 12,
            lossTolerancePct: 10,
            concentrationPct: 15,
          },
        },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: /5\. Verdict/ }));
    expect(screen.getByText('Caution')).toBeTruthy();
    expect(screen.getByText(/rated High risk; the client's risk appetite is medium/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Generate explanation/ }));
    expect(await screen.findByText('A fall below the barrier at maturity.')).toBeTruthy();
    expect(bodies['/api/explain']).toEqual([{ simulationId: 'sim-1' }]);

    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'Where is the barrier?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ask/ }));
    expect(await screen.findByText('The barrier is 80% of the starting level.')).toBeTruthy();
    expect(bodies['/api/chat']).toEqual([
      { simulationId: 'sim-1', question: 'Where is the barrier?', history: [] },
    ]);

    // The next question carries the conversation so far.
    fireEvent.click(screen.getByRole('button', { name: 'Why is this the verdict?' }));
    await waitFor(() => expect(bodies['/api/chat']).toHaveLength(2));
    expect(bodies['/api/chat']![1]).toMatchObject({
      question: 'Why is this the verdict?',
      history: [
        { role: 'user', content: 'Where is the barrier?' },
        { role: 'assistant', content: 'The barrier is 80% of the starting level.' },
      ],
    });
  });

  it('asks for no client name or age, and sends none with the verdict request', async () => {
    const { bodies } = backend();
    renderApp();
    expect(screen.queryByLabelText('Client name')).toBeNull();
    expect(screen.queryByLabelText('Client age')).toBeNull();
    await runModeB();
    await waitFor(() => expect(bodies['/api/suitability']).toHaveLength(1));
    const sent = bodies['/api/suitability']![0] as { profile: Record<string, unknown> };
    expect(Object.keys(sent.profile).sort()).toEqual([
      'concentrationPct',
      'horizonMonths',
      'lossTolerancePct',
      'riskAppetite',
    ]);
  });

  it('lets the RM run as soon as the product terms and level are in', () => {
    backend();
    renderApp();
    goToSimulate();
    fireEvent.change(screen.getByLabelText(/Starting level \(S/), { target: { value: '25000' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Run simulation/ }).disabled).toBe(
      false,
    );
  });

  it('has no saved-profile controls and never calls /api/client-profiles', async () => {
    const { fetchMock } = backend();
    renderApp();
    expect(screen.queryByLabelText('Saved profile')).toBeNull();
    expect(screen.queryByText(/saved profile/i)).toBeNull();
    expect(screen.queryByLabelText('Client reference')).toBeNull();
    await runModeB();
    expect(fetchMock.mock.calls.map(([u]) => u)).not.toContain('/api/client-profiles');
  });

  it('shows a forecast failure as-is and offers Mode B instead of a substitute', async () => {
    vi.stubGlobal('fetch', () =>
      json(503, { error: { code: 'AI_UNAVAILABLE', message: 'Forecast service unavailable' } }),
    );
    renderApp();
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: /Mode A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));

    expect(await screen.findByText('AI_UNAVAILABLE')).toBeTruthy();
    expect(screen.queryByText(/likely range/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Switch to Mode B/ }));
    expect(screen.getByRole('radio', { name: /Mode B/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('AI_UNAVAILABLE')).toBeNull();
  });

  it('lets the RM pick a training window from 30 days to 3 years for Mode A', async () => {
    const simulateBodies: unknown[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (url === '/api/simulate') simulateBodies.push(JSON.parse(init?.body as string));
      return json(503, {
        error: { code: 'AI_UNAVAILABLE', message: 'Forecast service unavailable' },
      });
    });
    renderApp();
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: /Mode A/ }));

    const slider = screen.getByLabelText<HTMLInputElement>('Training window');
    expect(slider.type).toBe('range');
    expect([slider.min, slider.max]).toEqual(['30', '1095']);
    expect(screen.getByText('1095 days (3.0 years)')).toBeTruthy();

    fireEvent.change(slider, { target: { value: '365' } });
    expect(screen.getByText('365 days (1.0 years)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
    await waitFor(() =>
      expect(simulateBodies).toMatchObject([{ mode: 'A', trainingWindowYears: 1 }]),
    );
    // The old two-option choice is gone.
    expect(screen.queryByText('10 years (incl. 2020)')).toBeNull();
    expect(screen.queryByRole('radio', { name: '5 years' })).toBeNull();
  });

  it('streams the live price for the underlying over /api/live', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /2\. Structure/ }));
    fireEvent.change(screen.getByLabelText(/Underlying symbol/), { target: { value: 'AAPL' } });
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: 'Live level' }));

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toMatch(/\/api\/live$/);
    await waitFor(() => expect(ws.sent).toEqual([{ type: 'subscribe', symbol: 'AAPL' }]));
    act(() => {
      ws.receive({ type: 'subscribed', symbol: 'AAPL', provider: 'Finnhub' });
      ws.receive({ type: 'tick', symbol: 'AAPL', price: 231.5, asOf: new Date().toISOString() });
    });
    expect(await screen.findByText('231.50')).toBeTruthy();
    expect(screen.getByText(/Last trade .* · Finnhub/)).toBeTruthy();
  });

  it('offers a typed level when the live feed is not configured', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('fetch', () =>
      json(503, {
        error: {
          code: 'MARKET_DATA_UNAVAILABLE',
          message: 'Live market data is not configured: enter the level manually',
        },
      }),
    );
    renderApp();
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: 'Live level' }));
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));

    expect(await screen.findByText('MARKET_DATA_UNAVAILABLE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enter level manually/ }));
    expect(screen.queryByText('MARKET_DATA_UNAVAILABLE')).toBeNull();
    expect(screen.getByLabelText(/Starting level \(S/)).toBeTruthy();
  });

  it('DCD in Mode A shows the Nifty 50 forecast as context only, with no payoff or verdict', async () => {
    const context = {
      kind: 'forecast_context',
      mode: 'A',
      productType: 'DCD',
      underlying: { symbol: '^NSEI', name: 'Nifty 50' },
      spot: { value: 25_000, asOf: '2026-10-01' },
      horizon: { tenorDays: 90, tradingDays: 62 },
      fan: {
        p5: [25_000, 24_000, 23_000],
        p50: [25_000, 25_100, 25_200],
        p95: [25_000, 26_000, 27_000],
      },
      model: {
        name: 'garch11-t-montecarlo',
        version: '1.0.1',
        simulations: 10_000,
        drift: { method: 'fixed', annualized: 0.0756 },
        trainingWindowYears: 10,
        trainingStart: '2016-10-03',
        trainingEnd: '2026-10-01',
        observations: 2_480,
      },
      backtest: {
        horizonTradingDays: 62,
        windows: 30,
        bandCoverage: 0.88,
        baseMape: 0.05,
        naiveMape: 0.06,
      },
      history: { status: 'unavailable', reason: 'No price history provider is configured' },
      notice:
        'Nifty 50 forecast, shown for context only. Use Mode B (FX shock) for the DCD payoff.',
    };
    const urls: string[] = [];
    const simulateBodies: unknown[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url === '/api/simulate') {
        simulateBodies.push(JSON.parse(init?.body as string));
        return json(200, context);
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'unexpected call' } });
    });
    renderApp();
    // The product cards are on the Structure stage.
    fireEvent.click(screen.getByRole('button', { name: /2\. Structure/ }));
    fireEvent.click(screen.getByRole('radio', { name: /DCD/ }));
    goToSimulate();
    const modeA = screen.getByRole<HTMLButtonElement>('radio', { name: /Mode A/ });
    expect(modeA.disabled).toBe(false);
    fireEvent.click(modeA);
    expect(screen.getByText(/shows its Nifty 50 forecast as context only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));

    expect(await screen.findByText('Nifty 50: 5th–95th percentile range')).toBeTruthy();
    expect(screen.getByText('Mode A forecast · context only')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/context only/);
    expect(screen.getByText('How the forecast was made')).toBeTruthy();
    expect(simulateBodies).toMatchObject([
      { mode: 'A', productType: 'DCD', terms: { depositCurrency: 'USD' } },
    ]);

    // Not a run: no verdict is requested, nothing is listed in the session, no payoff is shown.
    expect(urls).toEqual(['/api/simulate']);
    expect(screen.queryByText(/Latest run/)).toBeNull();
    expect(screen.queryByText('Result')).toBeNull();

    // The forecast belongs to these inputs: changing the product and coming back must not show it.
    fireEvent.click(screen.getByRole('button', { name: /2\. Structure/ }));
    fireEvent.click(screen.getByRole('radio', { name: /ELN/ }));
    fireEvent.click(screen.getByRole('radio', { name: /DCD/ }));
    goToSimulate();
    expect(screen.queryByText('Mode A forecast · context only')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Mode A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
    expect(await screen.findByText('Mode A forecast · context only')).toBeTruthy();

    // The note offers the way to the DCD payoff.
    fireEvent.click(screen.getByRole('button', { name: /Switch to Mode B for the DCD payoff/ }));
    expect(screen.getByRole('radio', { name: /Mode B/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the Nifty 50 context off the screen for other products', () => {
    renderApp();
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: /Mode A/ }));
    expect(screen.queryByText(/shows its Nifty 50 forecast as context only/)).toBeNull();
    expect(screen.queryByText('Mode A forecast · context only')).toBeNull();
  });
});

describe('comparing runs', () => {
  it('puts two runs from this session side by side with their backend verdicts', async () => {
    const { fetchMock } = backend();
    renderApp();
    await runModeB();
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === '/api/suitability')).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole('button', { name: /Runs/ }));
    const compare = await screen.findByRole('button', { name: /Compare \(0\)/ });
    expect((compare as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare run-1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare run-2' }));
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Compare \(2\)/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Compare 2 runs' });
    const table = within(dialog).getByRole('table', { name: 'Selected runs side by side' });
    expect(within(table).getAllByText('₹10,47,500')).toHaveLength(2);
    expect(within(table).getAllByText('Caution')).toHaveLength(2);
    // Same client, same mode, same shock: nothing to warn about, and nothing ranked.
    expect(within(dialog).queryByText(/different client profiles/)).toBeNull();
    expect(within(dialog).getByText(/does not rank the products or recommend one/)).toBeTruthy();
    // Comparing reads what the backend already returned: no new request.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
