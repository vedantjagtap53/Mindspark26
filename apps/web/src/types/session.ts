import type { ChatResponse, ExplainResponse, SuitabilityResponse } from '@mindspark/shared';
import type { ApiRequestError, SimulateResponse } from '../api/client';
import type { ProductType, ProfileForm, RunSettings } from '../state/forms';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Present on answers: scope, risk note and sources from the AI service. */
  answer?: ChatResponse;
}

/**
 * One completed run, kept in this browser tab. The backend keeps its own copy under
 * `response.simulationId` for suitability, explanation and chat.
 */
export interface SessionRun {
  id: string;
  /** ISO timestamp of when the response arrived. */
  at: string;
  product: ProductType;
  profile: ProfileForm;
  run: RunSettings;
  /** The `terms` exactly as sent to /api/simulate. */
  terms: Record<string, unknown>;
  response: SimulateResponse;
  /** The backend's verdict for `profile`, or why it could not be computed. */
  suitability?: SuitabilityResponse;
  suitabilityError?: ApiRequestError;
  explanation?: ExplainResponse;
  chat: ChatMessage[];
}
