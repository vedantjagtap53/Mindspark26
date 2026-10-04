import { describe, expect, it } from 'vitest';
import {
  createYahooHistoryProvider,
  yahooSymbol,
  type HistoryProvider,
} from '../../../src/services/market-data/history/yahooHistoryProvider.js';
import { historyLength, requestFanHistory } from '../../../src/services/simulation/fanHistory.js';

const IST = 19_800;
/** Yahoo stamps NSE bars at the 09:15 IST open. */
const openAt = (date: string) => Date.parse(`${date}T09:15:00+05:30`) / 1000;

function chart(symbol: string, bars: Array<[string, number | null]>) {
  return {
    chart: {
      error: null,
      result: [
        {
          meta: { symbol, gmtoffset: IST },
          timestamp: bars.map(([d]) => openAt(d)),
          indicators: { quote: [{ close: bars.map(([, c]) => c) }] },
        },
      ],
    },
  };
}

const respond = (body: unknown, status = 200) => {
  const urls: string[] = [];
  const fetchImpl = ((url: string) => {
    urls.push(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
};

const nifty = { symbol: '^NSEI', assetClass: 'index' as const };

describe('Yahoo Finance history provider', () => {
  it('returns trading-date closes, skipping null (holiday) bars and filling nothing', async () => {
    const { fetchImpl, urls } = respond(
      chart('^NSEI', [
        ['2026-09-30', 22620.449219],
        ['2026-10-01', 22421.949219],
        ['2026-10-02', null],
      ]),
    );
    const p = createYahooHistoryProvider({ apiUrl: 'https://y.example/', fetchImpl });
    const points = await p.dailyCloses(nifty, '2026-09-01', '2026-10-02');
    expect(points).toEqual([
      { date: '2026-09-30', close: 22620.449219 },
      { date: '2026-10-01', close: 22421.949219 },
    ]);
    expect(urls[0]).toMatch(/^https:\/\/y\.example\/v8\/finance\/chart\/%5ENSEI\?period1=/);
  });

  it('maps FX pairs to Yahoo symbols', () => {
    expect(yahooSymbol('USDINR', 'fx')).toBe('USDINR=X');
    expect(yahooSymbol('^NSEI', 'index')).toBe('^NSEI');
  });

  it('rejects errors, malformed bodies and answers for another symbol', async () => {
    const make = (body: unknown, status = 200) =>
      createYahooHistoryProvider({
        apiUrl: 'https://y',
        fetchImpl: respond(body, status).fetchImpl,
      });
    await expect(make({}, 404).dailyCloses(nifty, '2026-01-01', '2026-02-01')).rejects.toThrow(
      'HTTP 404',
    );
    await expect(make({ nope: 1 }).dailyCloses(nifty, '2026-01-01', '2026-02-01')).rejects.toThrow(
      'unexpected response',
    );
    await expect(
      make(chart('^GSPC', [])).dailyCloses(nifty, '2026-01-01', '2026-02-01'),
    ).rejects.toThrow('not ^NSEI');
  });

  it('caches an answer', async () => {
    const { fetchImpl, urls } = respond(chart('^NSEI', [['2026-10-01', 1]]));
    const p = createYahooHistoryProvider({ apiUrl: 'https://y', fetchImpl });
    await p.dailyCloses(nifty, '2026-09-01', '2026-10-02');
    await p.dailyCloses(nifty, '2026-09-01', '2026-10-02');
    expect(urls).toHaveLength(1);
  });
});

describe('fan history matching', () => {
  const provider = (points: Array<{ date: string; close: number }>): HistoryProvider => ({
    name: 'H',
    dailyCloses: () => Promise.resolve(points),
  });

  it('keeps between 60 and 252 trading days', () => {
    expect(historyLength(21)).toBe(60);
    expect(historyLength(126)).toBe(126);
    expect(historyLength(757)).toBe(252);
  });

  it('refuses history whose close on the as-of date differs from the spot', async () => {
    const h = requestFanHistory(provider([{ date: '2026-10-01', close: 22_500 }]), nifty, 126);
    const r = await h.match(22_421.95, '2026-10-01');
    expect(r.status).toBe('unavailable');
  });

  it('refuses history that does not reach the as-of date', async () => {
    const h = requestFanHistory(provider([{ date: '2026-09-30', close: 22_421.95 }]), nifty, 126);
    expect(await h.match(22_421.95, '2026-10-01')).toMatchObject({ status: 'unavailable' });
  });

  it('reports a provider failure as unavailable', async () => {
    const failing: HistoryProvider = {
      name: 'H',
      dailyCloses: () => Promise.reject(new Error('down')),
    };
    expect(await requestFanHistory(failing, nifty, 126).match(1, '2026-10-01')).toEqual({
      status: 'unavailable',
      reason: 'down',
    });
  });
});
