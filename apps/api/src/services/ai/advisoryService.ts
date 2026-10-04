// POST /api/explain and /api/chat: send the stored run (numbers, profile, verdict) to the AI
// service and return its text. The backend stays authoritative: an explanation that names a
// different verdict or simulation is rejected, never shown.

import type { ChatRequest, ChatResponse, ExplainResponse } from '@mindspark/shared';
import { AppError } from '../../utils/errors.js';
import type { SimulationRecords } from '../simulation/simulationRecords.js';
import type { RagClient } from './ragClient.js';
import { buildRagContext } from './simulationContext.js';

export interface AdvisoryService {
  explain(simulationId: string): Promise<ExplainResponse>;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface AdvisoryDeps {
  records: SimulationRecords;
  /** Absent when RAG_API_URL is not configured. */
  rag?: RagClient;
}

function requireRag(rag: RagClient | undefined): RagClient {
  if (!rag) {
    throw new AppError(
      'AI_UNAVAILABLE',
      'The explanation service is not configured (set RAG_API_URL and start npm run dev:rag)',
    );
  }
  return rag;
}

export function createAdvisoryService(deps: AdvisoryDeps): AdvisoryService {
  return {
    async explain(simulationId) {
      const rag = requireRag(deps.rag);
      const record = deps.records.get(simulationId);
      const context = buildRagContext(record);
      const out = await rag.explain(context);
      if (out.simulation_id !== simulationId || out.verdict !== context.suitability.verdict) {
        throw new AppError(
          'AI_INVALID_RESPONSE',
          'The explanation does not match this simulation or its verdict, so it was not shown',
        );
      }
      const response: ExplainResponse = {
        simulationId,
        verdict: out.verdict,
        sections: {
          whatItIs: out.sections.what_it_is,
          bestCase: out.sections.best_case,
          worstCase: out.sections.worst_case,
          lossTriggers: out.sections.loss_triggers,
          suitabilityReasoning: out.sections.suitability_reasoning,
        },
        riskNotice: out.risk_notice,
        checksPassed: out.checks_passed,
        ungroundedNumbers: out.ungrounded_numbers,
        sources: out.sources,
        model: out.model_name,
      };
      deps.records.update(simulationId, { explanation: response });
      return response;
    },

    async chat({ simulationId, question, history }) {
      const rag = requireRag(deps.rag);
      const context = buildRagContext(deps.records.get(simulationId));
      const out = await rag.chat(context, question, history);
      if (out.simulation_id !== simulationId) {
        throw new AppError('AI_INVALID_RESPONSE', 'The chat answer is for a different simulation');
      }
      return {
        simulationId,
        answer: out.answer,
        scope: out.scope,
        checksPassed: out.checks_passed,
        riskNote: out.risk_note,
        sources: out.sources,
        model: out.model_name,
      };
    },
  };
}
