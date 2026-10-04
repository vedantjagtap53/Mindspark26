// Journey tests with a stubbed API. The stub stands in for the backend in tests only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type ExplainResponse,
  type ShockOutcome,
  type SimulateModeBResponse,
  type SuitabilityResponse,
} from '@mindspark/shared';
import { App } from '../src/App';

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

/** The app opens on the landing page; every journey starts from its button. */
function renderApp(clientName: string | null = 'Asha Rao') {
  render(<App />);
  fireEvent.click(screen.getAllByRole('button', { name: /Start New Mandate/ })[0]!);
  // A run needs the client's name; pass null to leave it empty.
  if (clientName !== null) {
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: clientName } });
  }
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
            name: 'Asha Rao',
            age: 30,
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

  it('sends the name and age the RM typed with the verdict request', async () => {
    const { bodies } = backend();
    renderApp('  Ravi Menon ');
    fireEvent.change(screen.getByLabelText('Client age'), { target: { value: '61' } });
    await runModeB();
    await waitFor(() =>
      expect(bodies['/api/suitability']).toMatchObject([
        { profile: { name: 'Ravi Menon', age: 61 } },
      ]),
    );
  });

  it('holds the run until the client name and age are entered', () => {
    backend();
    renderApp(null);
    goToSimulate();
    fireEvent.change(screen.getByLabelText(/Starting level \(S/), { target: { value: '25000' } });
    const run = screen.getByRole<HTMLButtonElement>('button', { name: /Run simulation/ });
    expect(run.disabled).toBe(true);
    expect(screen.getByText('Enter the client name.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /1\. Mandate/ }));
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('Client age'), { target: { value: '' } });
    goToSimulate();
    expect(screen.getByText('Enter the client age.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Run simulation/ }).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: /1\. Mandate/ }));
    fireEvent.change(screen.getByLabelText('Client age'), { target: { value: '45' } });
    goToSimulate();
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

  it('offers Mode A for DCD and sends the FX terms to the backend', async () => {
    const { bodies } = backend();
    renderApp();
    // The product cards are on the Structure stage.
    fireEvent.click(screen.getByRole('button', { name: /2\. Structure/ }));
    fireEvent.click(screen.getByRole('radio', { name: /DCD/ }));
    goToSimulate();
    const modeA = screen.getByRole<HTMLButtonElement>('radio', { name: /Mode A/ });
    expect(modeA.disabled).toBe(false);
    fireEvent.click(modeA);
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));
    await waitFor(() => expect(bodies['/api/simulate']).toHaveLength(1));
    expect(bodies['/api/simulate']![0]).toMatchObject({
      mode: 'A',
      productType: 'DCD',
      terms: { depositCurrency: 'USD', alternateCurrency: 'INR' },
    });
  });
});
