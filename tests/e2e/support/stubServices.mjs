// TEST-ONLY stand-ins for the external services the API calls, so the browser tests are
// deterministic and need no keys: the forecast service (contract v1.0, docs/forecasting.md), the
// explanation/chat service (services/rag) and the Yahoo Finance chart API (fan-chart history).
// Every number here is synthetic and must never be used outside tests (CLAUDE.md).
import { createServer } from 'node:http';

const PORT = Number(process.env.E2E_STUB_PORT ?? 4911);
const SPOTS = { '^NSEI': 22421.95, USDINR: 84 };

const today = () => new Date().toISOString().slice(0, 10);
const tradingDays = (tenorDays) => Math.round((tenorDays * 252) / 365);
const line = (spot, end, steps) =>
  Array.from({ length: steps + 1 }, (_, i) =>
    Number((spot + ((end - spot) * i) / steps).toFixed(4)),
  );

function forecast(req) {
  const spot = SPOTS[req.underlying.symbol];
  if (!spot) return [400, { error: { code: 'UNSUPPORTED_UNDERLYING', message: 'stub' } }];
  const steps = tradingDays(req.tenorDays);
  const n = req.samplePathCount ?? 500;
  const end = (f) => spot * f;
  return [
    200,
    {
      contractVersion: '1.0',
      model: {
        name: 'garch11-t-montecarlo',
        version: 'e2e-stub',
        simulations: 10000,
        drift: { method: 'fixed', annualized: 0.0756 },
      },
      data: {
        symbol: req.underlying.symbol,
        asOf: today(),
        trainingStart: '2016-10-03',
        trainingEnd: today(),
        observations: 2468,
        spot,
      },
      horizon: { tenorDays: req.tenorDays, tradingDays: steps },
      cases: {
        low: { percentile: 5, path: line(spot, end(0.78), steps) },
        base: { percentile: 50, path: line(spot, end(1.03), steps) },
        high: { percentile: 95, path: line(spot, end(1.2), steps) },
      },
      terminalQuantiles: { p5: end(0.78), p50: end(1.03), p95: end(1.2) },
      fan: {
        p5: line(spot, end(0.78), steps),
        p50: line(spot, end(1.03), steps),
        p95: line(spot, end(1.2), steps),
      },
      samplePaths: Array.from({ length: n }, (_, i) =>
        line(spot, end(0.7 + (0.6 * i) / (n - 1)), steps),
      ),
      backtest: {
        horizonTradingDays: steps,
        windows: 30,
        bandCoverage: 0.88,
        baseMape: 0.071,
        naiveMape: 0.074,
      },
      notice: 'Scenario simulation, not a guarantee.',
    },
  ];
}

const explain = (ctx) => [
  200,
  {
    simulation_id: ctx.simulation_id,
    verdict: ctx.suitability.verdict,
    sections: {
      what_it_is: `E2E stub explanation for a ${ctx.terms.product}.`,
      best_case: 'Best case stub.',
      worst_case: 'Worst case stub.',
      loss_triggers: 'Loss trigger stub.',
      suitability_reasoning: `The verdict is ${ctx.suitability.verdict}.`,
    },
    risk_notice: 'Scenario simulation, not a guarantee.',
    checks_passed: true,
    ungrounded_numbers: [],
    guardrail_violations: [],
    sources: ['stub.md'],
    model_name: 'e2e-stub',
  },
];

const chat = ({ context, question }) => [
  200,
  {
    simulation_id: context.simulation_id,
    answer: `Stub answer to: ${question}`,
    scope: 'in_scope',
    checks_passed: true,
    risk_note: 'Scenario simulation, not a guarantee.',
    ungrounded_numbers: [],
    guardrail_violations: [],
    sources: [],
    model_name: 'e2e-stub',
  },
];

/** Yahoo-shaped daily bars for the last 400 days on weekdays, ending at the forecast spot today. */
function chart(symbol) {
  const key = symbol === 'USDINR=X' ? 'USDINR' : symbol;
  const spot = SPOTS[key];
  if (!spot) return [404, { chart: { result: null, error: { code: 'Not Found' } } }];
  const days = [];
  for (let d = 400; d >= 0; d--) {
    const t = new Date(Date.now() - d * 86_400_000);
    if (d === 0 || (t.getUTCDay() !== 0 && t.getUTCDay() !== 6))
      days.push(t.toISOString().slice(0, 10));
  }
  const close = days.map((_, i) =>
    i === days.length - 1
      ? spot
      : spot * (0.9 + 0.1 * Math.sin(i / 15) * 0.5 + (0.1 * i) / days.length),
  );
  return [
    200,
    {
      chart: {
        error: null,
        result: [
          {
            meta: { symbol, gmtoffset: 0 },
            timestamp: days.map((d) => Date.parse(`${d}T09:15:00Z`) / 1000),
            indicators: { quote: [{ close }] },
          },
        ],
      },
    },
  ];
}

createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const body = raw ? JSON.parse(raw) : undefined;
    let out = [404, { error: 'not found' }];
    if (req.method === 'POST' && url.pathname === '/v1/forecast') out = forecast(body);
    else if (req.method === 'POST' && url.pathname === '/rag/explain') out = explain(body);
    else if (req.method === 'POST' && url.pathname === '/rag/chat') out = chat(body);
    else if (url.pathname.startsWith('/yahoo/v8/finance/chart/')) {
      out = chart(decodeURIComponent(url.pathname.split('/').pop()));
    } else if (url.pathname === '/health') out = [200, { ok: true }];
    res.writeHead(out[0], { 'content-type': 'application/json' });
    res.end(JSON.stringify(out[1]));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`e2e stubs on ${PORT}`));
