// Database-neutral repository errors. Services map them to API error codes; the adapter maps
// provider errors to them. No fallback store is ever tried (Supabase only).

export type RepositoryErrorKind =
  /** Database settings are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). */
  | 'not_configured'
  /** The database could not be reached or failed; nothing was written. */
  | 'unavailable'
  /** A uniqueness rule was violated (duplicate clientRef, second verdict for a simulation). */
  | 'conflict'
  /** A referenced row does not exist (unknown configuration, profile or simulation id). */
  | 'invalid_reference'
  /** The input breaks a repository rule (e.g. too many or mismatched risk results). */
  | 'invalid_input';

export class RepositoryError extends Error {
  constructor(
    readonly kind: RepositoryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
