export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_IMPLEMENTED'
  | 'DATABASE_NOT_CONFIGURED'
  | 'DATABASE_ERROR'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'MARKET_DATA_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationIssue[];
  };
}

export type RuntimeEnvironment = 'development' | 'test' | 'production';

/** Liveness plus configuration status. Never contains secrets. */
export interface HealthResponse {
  status: 'ok';
  environment: RuntimeEnvironment;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    provider: 'supabase';
    /** Whether the Supabase URL and service-role key are set. Not a connectivity check. */
    configured: boolean;
  };
}
