// Repository interfaces: the only way services reach the database
// (Controller → Service → Repository interface → Supabase adapter).
// Ids are canonical lowercase UUID strings. Failures throw RepositoryError.
// There are deliberately no delete methods: simulations and their results are audit evidence.
// Users are deactivated, and refresh tokens revoked, rather than deleted.

import type { ActivityEvent, ActivityEventType } from '@mindspark/shared';
import type {
  ExplanationInput,
  ProductConfigurationInput,
  ProductConfigurationRecord,
  SimulationInput,
  SimulationRecord,
  SuitabilityResultInput,
} from './records.js';
import type { RefreshTokenRepository, UserRepository } from './users.js';

export interface ProductConfigurationRepository {
  create(input: ProductConfigurationInput): Promise<string>;
  getById(id: string): Promise<ProductConfigurationRecord | null>;
}

export interface SimulationRepository {
  /** Writes the simulation and all its risk results atomically; returns the new id. */
  record(input: SimulationInput): Promise<string>;
  getById(id: string): Promise<SimulationRecord | null>;
  /** Newest first, every account's runs. Read-only; the admin audit view. */
  listRecent(limit: number): Promise<SimulationRecord[]>;
  /** Newest first, one account's own runs ("my saved runs"). */
  listByUser(userId: string, limit: number): Promise<SimulationRecord[]>;
  /** Newest first, runs saved at or after `sinceIso`. Feeds the admin analytics. */
  listSince(sinceIso: string, limit: number): Promise<SimulationRecord[]>;
  /** Every saved run, ever. */
  count(): Promise<number>;
}

export interface ActivityEventInput {
  /** The account the event is about; null when no account matched. */
  userId: string | null;
  actorEmail: string | null;
  event: ActivityEventType;
  /** Small, non-sensitive facts only: never a password, token or request body. */
  detail: Record<string, unknown>;
}

/** Append-only log of what happens to accounts, and of saved runs. Read by the admin only. */
export interface ActivityEventRepository {
  record(input: ActivityEventInput): Promise<void>;
  /** Newest first. */
  listRecent(limit: number): Promise<ActivityEvent[]>;
  /** Newest first, events at or after `sinceIso`. */
  listSince(sinceIso: string, limit: number): Promise<ActivityEvent[]>;
}

export interface SuitabilityResultRepository {
  /** One verdict per simulation: a second one → RepositoryError('conflict'). */
  create(input: SuitabilityResultInput): Promise<string>;
}

export interface ExplanationRepository {
  create(input: ExplanationInput): Promise<string>;
}

export interface Repositories {
  productConfigurations: ProductConfigurationRepository;
  simulations: SimulationRepository;
  suitabilityResults: SuitabilityResultRepository;
  explanations: ExplanationRepository;
  activity: ActivityEventRepository;
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
}
