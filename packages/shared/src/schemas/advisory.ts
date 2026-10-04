// POST /api/explain and POST /api/chat. The text comes from the external AI service (services/rag),
// which only explains numbers the backend computed; it never returns payoff, risk or suitability.

import { z } from 'zod';
import type { SuitabilityVerdict } from '../enums/domain.js';
import { simulationIdSchema } from './suitability.js';

export const explainRequestSchema = z.strictObject({ simulationId: simulationIdSchema });
export type ExplainRequest = z.output<typeof explainRequestSchema>;

export const chatTurnSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});
export type ChatTurn = z.output<typeof chatTurnSchema>;

export const CHAT_QUESTION_MAX_CHARS = 1000;

export const chatRequestSchema = z.strictObject({
  simulationId: simulationIdSchema,
  question: z.string().trim().min(1).max(CHAT_QUESTION_MAX_CHARS),
  history: z.array(chatTurnSchema).max(40).default([]),
});
export type ChatRequest = z.output<typeof chatRequestSchema>;

export interface ExplainResponse {
  simulationId: string;
  verdict: SuitabilityVerdict;
  sections: {
    whatItIs: string;
    bestCase: string;
    worstCase: string;
    lossTriggers: string;
    suitabilityReasoning: string;
  };
  /** Fixed text written by the AI service's code, not by the model. */
  riskNotice: string;
  /** False when the AI service found numbers it could not match to the computed results. */
  checksPassed: boolean;
  ungroundedNumbers: string[];
  sources: string[];
  model: string;
}

export interface ChatResponse {
  simulationId: string;
  answer: string;
  scope: 'in_scope' | 'out_of_scope';
  checksPassed: boolean;
  riskNote: string;
  sources: string[];
  model: string;
}
