import { describe, expect, it } from 'vitest';
import { createRagClient } from '../../../src/services/ai/ragClient.js';
import type { RagSimulationContext } from '../../../src/services/ai/simulationContext.js';
import { AppError } from '../../../src/utils/errors.js';

const ctx = { simulation_id: 'sim-1' } as RagSimulationContext;
const okExplanation = {
  simulation_id: 'sim-1',
  verdict: 'Caution',
  sections: {
    what_it_is: 'x'.repeat(20),
    best_case: 'x'.repeat(20),
    worst_case: 'x'.repeat(20),
    loss_triggers: 'x'.repeat(20),
    suitability_reasoning: 'x'.repeat(20),
  },
  risk_notice: 'Not a guarantee.',
  checks_passed: true,
  model_name: 'gemini',
};

type Call = [string, RequestInit];

function fetchReturning(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return ((url: string, init: RequestInit) => {
    calls.push([url, init]);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return 'resolved';
  } catch (err) {
    return err instanceof AppError ? err.code : 'other';
  }
}

describe('RAG client', () => {
  it('posts the context with the API key and returns the validated explanation', async () => {
    const calls: Call[] = [];
    const client = createRagClient({
      baseUrl: 'http://rag.local:8001/',
      apiKey: 'k',
      fetchImpl: fetchReturning(200, okExplanation, calls),
    });
    const out = await client.explain(ctx);
    expect(out.verdict).toBe('Caution');
    expect(out.sources).toEqual([]);
    expect(calls[0]![0]).toBe('http://rag.local:8001/explain');
    expect(calls[0]![1].headers).toMatchObject({ 'x-api-key': 'k' });
    expect(JSON.parse(calls[0]![1].body as string)).toEqual(ctx);
  });

  it('sends question and history to /chat', async () => {
    const calls: Call[] = [];
    const client = createRagClient({
      baseUrl: 'http://rag.local',
      fetchImpl: fetchReturning(
        200,
        {
          simulation_id: 'sim-1',
          answer: 'ok',
          scope: 'out_of_scope',
          checks_passed: true,
          risk_note: 'n',
          model_name: 'm',
        },
        calls,
      ),
    });
    const out = await client.chat(ctx, 'Q?', [{ role: 'user', content: 'Hi' }]);
    expect(out.scope).toBe('out_of_scope');
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({
      context: ctx,
      question: 'Q?',
      history: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('maps failures to AI_UNAVAILABLE and bad shapes to AI_INVALID_RESPONSE', async () => {
    const down = createRagClient({
      baseUrl: 'http://rag.local',
      fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    expect(await codeOf(down.explain(ctx))).toBe('AI_UNAVAILABLE');
    const unauthorized = createRagClient({
      baseUrl: 'http://rag.local',
      fetchImpl: fetchReturning(401, { detail: 'Invalid or missing API key' }),
    });
    await expect(unauthorized.explain(ctx)).rejects.toThrow(/RAG_API_KEY/);
    const broken = createRagClient({
      baseUrl: 'http://rag.local',
      fetchImpl: fetchReturning(200, { verdict: 'Maybe' }),
    });
    expect(await codeOf(broken.explain(ctx))).toBe('AI_INVALID_RESPONSE');
  });
});
