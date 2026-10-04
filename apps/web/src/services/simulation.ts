// API calls for the RM journey, built from form state. The backend validates and computes.
import type { ChatTurn } from '@mindspark/shared';
import { api } from '../api/client';
import {
  clientProfile,
  configureRequest,
  simulateRequest,
  type Forms,
  type ProductType,
  type ProfileForm,
  type RunSettings,
} from '../state/forms';

/** POST /api/configure: the server's validated, normalized terms. */
export const validateTerms = (product: ProductType, forms: Forms, fetchImpl?: typeof fetch) =>
  api.configure(configureRequest(product, forms), fetchImpl);

/** POST /api/simulate (Mode A or B). */
export const simulate = (
  product: ProductType,
  forms: Forms,
  run: RunSettings,
  fetchImpl?: typeof fetch,
) => api.simulate(simulateRequest(product, forms, run), fetchImpl);

/** POST /api/suitability: the backend's verdict for a stored run and this profile. */
export const assessSuitability = (
  simulationId: string,
  profile: ProfileForm,
  fetchImpl?: typeof fetch,
) => api.suitability({ simulationId, profile: clientProfile(profile) }, fetchImpl);

/** POST /api/explain: plain-language explanation written by the AI service. */
export const explain = (simulationId: string, fetchImpl?: typeof fetch) =>
  api.explain({ simulationId }, fetchImpl);

/** Turns kept for chat context; the AI service uses the most recent ones. */
const CHAT_HISTORY_TURNS = 12;

/** POST /api/chat: one question about this simulation, with recent history. */
export const askChat = (
  simulationId: string,
  question: string,
  history: ChatTurn[],
  fetchImpl?: typeof fetch,
) => api.chat({ simulationId, question, history: history.slice(-CHAT_HISTORY_TURNS) }, fetchImpl);
