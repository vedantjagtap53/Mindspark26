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

const savedProfiles = [
  {
    id: '6f1c1f5e-3b0a-4a76-9b2c-1d2e3f4a5b6c',
    clientRef: 'CL-0042',
    label: 'Retirement',
    riskAppetite: 'low',
    horizonMonths: 36,
    lossTolerancePct: 5,
    concentrationPct: 20,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

/** Routes the stubbed API by path, recording each request body. */
function backend() {
  const bodies: Record<string, unknown[]> = {};
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    if (init?.body) (bodies[url] ??= []).push(JSON.parse(init.body as string));
    if (url === '/api/client-profiles') return json(200, { profiles: savedProfiles });
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

const goToSimulate = () => fireEvent.click(screen.getByRole('button', { name: /3\. Simulate/ }));

describe('Payoff Desk journey', () => {
  it('starts on the mandate stage with the verdict marked pending', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Capture the client mandate/ })).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('runs Mode B with a manual level and shows the backend payoff', async () => {
    const { fetchMock } = backend();
    render(<App />);
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
    render(<App />);
    await runModeB();

    // The verdict is requested for the run with the profile's four rule fields only.
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

  it('loads a saved profile and links the verdict to it', async () => {
    const { bodies } = backend();
    render(<App />);
    const select = await screen.findByLabelText('Saved profile');
    await screen.findByRole('option', { name: /CL-0042/ });
    fireEvent.change(select, { target: { value: savedProfiles[0]!.id } });
    fireEvent.click(screen.getByRole('button', { name: /Load saved profile/ }));
    expect(screen.getByLabelText<HTMLInputElement>('Client reference').value).toBe('CL-0042');
    expect(screen.getByRole('button', { name: /Update saved profile/ })).toBeTruthy();

    await runModeB();
    await waitFor(() =>
      expect(bodies['/api/suitability']).toEqual([
        {
          simulationId: 'sim-1',
          profileId: savedProfiles[0]!.id,
          profile: {
            riskAppetite: 'low',
            horizonMonths: 36,
            lossTolerancePct: 5,
            concentrationPct: 20,
          },
        },
      ]),
    );
  });

  it('saves a new profile through /api/client-profiles', async () => {
    const created = {
      ...savedProfiles[0]!,
      id: '11111111-2222-4333-8444-555555555555',
      clientRef: 'CL-7',
    };
    const posted: unknown[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(init.body as string));
        return json(201, created);
      }
      return json(200, { profiles: [] });
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('Client reference'), { target: { value: 'CL-7' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save profile/ }));
    expect(await screen.findByText('Saved CL-7.')).toBeTruthy();
    expect(posted[0]).toMatchObject({ clientRef: 'CL-7', label: null, riskAppetite: 'medium' });
  });

  it('shows the backend error when saved profiles are unavailable', async () => {
    vi.stubGlobal('fetch', () =>
      json(503, {
        error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Saved profiles need the database' },
      }),
    );
    render(<App />);
    expect(await screen.findByText(/DATABASE_NOT_CONFIGURED/)).toBeTruthy();
  });

  it('shows a forecast failure as-is and offers Mode B instead of a substitute', async () => {
    vi.stubGlobal('fetch', () =>
      json(503, { error: { code: 'AI_UNAVAILABLE', message: 'Forecast service unavailable' } }),
    );
    render(<App />);
    goToSimulate();
    fireEvent.click(screen.getByRole('radio', { name: /Mode A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }));

    expect(await screen.findByText('AI_UNAVAILABLE')).toBeTruthy();
    expect(screen.queryByText(/likely range/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Switch to Mode B/ }));
    expect(screen.getByRole('radio', { name: /Mode B/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('AI_UNAVAILABLE')).toBeNull();
  });

  it('streams the live price for the underlying over /api/live', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    render(<App />);
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
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'DCD' }));
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
