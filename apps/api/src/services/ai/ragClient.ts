// Client for the external explanation/chat service (services/rag, owned by the AI/ML developer).
// Sends the SimulationContext, validates the reply against its contract (rag/llm/output.py) and
// returns it parsed. Unreachable/non-2xx → AI_UNAVAILABLE; bad shape → AI_INVALID_RESPONSE.

import { z } from 'zod';
import type { ChatTurn } from '@mindspark/shared';
import { AppError } from '../../utils/errors.js';
import type { RagSimulationContext } from './simulationContext.js';

export const DEFAULT_RAG_TIMEOUT_MS = 90_000;

const verdict = z.enum(['Suitable', 'Caution', 'Not suitable']);

const explanationSchema = z.object({
  simulation_id: z.string(),
  verdict,
  sections: z.object({
    what_it_is: z.string(),
    best_case: z.string(),
    worst_case: z.string(),
    loss_triggers: z.string(),
    suitability_reasoning: z.string(),
  }),
  risk_notice: z.string(),
  checks_passed: z.boolean(),
  ungrounded_numbers: z.array(z.string()).default([]),
  guardrail_violations: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  model_name: z.string(),
});

const chatAnswerSchema = z.object({
  simulation_id: z.string(),
  answer: z.string(),
  scope: z.enum(['in_scope', 'out_of_scope']),
  checks_passed: z.boolean(),
  risk_note: z.string(),
  ungrounded_numbers: z.array(z.string()).default([]),
  guardrail_violations: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  model_name: z.string(),
});

export type RagExplanation = z.output<typeof explanationSchema>;
export type RagChatAnswer = z.output<typeof chatAnswerSchema>;

export interface RagClient {
  explain(context: RagSimulationContext): Promise<RagExplanation>;
  chat(
    context: RagSimulationContext,
    question: string,
    history: ChatTurn[],
  ): Promise<RagChatAnswer>;
}

export interface RagClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createRagClient(config: RagClientConfig): RagClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_RAG_TIMEOUT_MS;
  const base = config.baseUrl.replace(/\/+$/, '');

  async function post<S extends z.ZodType>(
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.output<S>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AppError('AI_UNAVAILABLE', 'The explanation service is unreachable or timed out');
    }
    if (!res.ok) {
      // 502 from services/rag means its language model call failed (key, quota or index).
      const hint =
        res.status === 401
          ? ' (check RAG_API_KEY)'
          : res.status === 502
            ? ': its language model failed (check GOOGLE_API_KEY in services/rag/.env and run npm run rag:index)'
            : '';
      throw new AppError(
        'AI_UNAVAILABLE',
        `The explanation service returned HTTP ${res.status}${hint}`,
      );
    }
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(
        'AI_INVALID_RESPONSE',
        'The explanation service returned an unexpected response',
        parsed.error.issues
          .slice(0, 10)
          .map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return parsed.data;
  }

  return {
    explain: (context) => post('/explain', context, explanationSchema),
    chat: (context, question, history) =>
      post('/chat', { context, question, history }, chatAnswerSchema),
  };
}
