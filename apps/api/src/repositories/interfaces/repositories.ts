// Repository interfaces: the only way services reach the database
// (Controller → Service → Repository interface → Supabase adapter).
// Ids are canonical lowercase UUID strings. Failures throw RepositoryError.
// There are deliberately no delete methods: simulations and their results are audit evidence.

import type {
  ClientProfileInput,
  ClientProfileRecord,
  ExplanationInput,
  ProductConfigurationInput,
  ProductConfigurationRecord,
  SimulationInput,
  SimulationRecord,
  SimulationSummary,
  SuitabilityResultInput,
} from './records.js';

export interface ClientProfileRepository {
  /** Returns the new id. Duplicate clientRef → RepositoryError('conflict'). */
  create(input: ClientProfileInput): Promise<string>;
  /** Replaces the editable fields. Returns false when the id does not exist. */
  update(id: string, input: ClientProfileInput): Promise<boolean>;
  getById(id: string): Promise<ClientProfileRecord | null>;
  getByRef(clientRef: string): Promise<ClientProfileRecord | null>;
  /** Most recently updated first. */
  list(page: { limit: number; offset: number }): Promise<ClientProfileRecord[]>;
}

export interface ProductConfigurationRepository {
  create(input: ProductConfigurationInput): Promise<string>;
  getById(id: string): Promise<ProductConfigurationRecord | null>;
}

export interface SimulationRepository {
  /** Writes the simulation and all its risk results atomically; returns the new id. */
  record(input: SimulationInput): Promise<string>;
  getById(id: string): Promise<SimulationRecord | null>;
  /** Newest first. */
  listForProfile(profileId: string, limit: number): Promise<SimulationSummary[]>;
}

export interface SuitabilityResultRepository {
  /** One verdict per simulation: a second one → RepositoryError('conflict'). */
  create(input: SuitabilityResultInput): Promise<string>;
}

export interface ExplanationRepository {
  create(input: ExplanationInput): Promise<string>;
}

export interface Repositories {
  clientProfiles: ClientProfileRepository;
  productConfigurations: ProductConfigurationRepository;
  simulations: SimulationRepository;
  suitabilityResults: SuitabilityResultRepository;
  explanations: ExplanationRepository;
}
