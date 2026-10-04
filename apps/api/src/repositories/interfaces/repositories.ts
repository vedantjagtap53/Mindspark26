// Repository interfaces: the only way services reach the database
// (Controller → Service → Repository interface → Supabase adapter).
// Ids are canonical lowercase UUID strings. Failures throw RepositoryError.
// There are deliberately no delete methods: simulations and their results are audit evidence.

import type {
  ExplanationInput,
  ProductConfigurationInput,
  ProductConfigurationRecord,
  SimulationInput,
  SimulationRecord,
  SuitabilityResultInput,
} from './records.js';

export interface ProductConfigurationRepository {
  create(input: ProductConfigurationInput): Promise<string>;
  getById(id: string): Promise<ProductConfigurationRecord | null>;
}

export interface SimulationRepository {
  /** Writes the simulation and all its risk results atomically; returns the new id. */
  record(input: SimulationInput): Promise<string>;
  getById(id: string): Promise<SimulationRecord | null>;
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
}
