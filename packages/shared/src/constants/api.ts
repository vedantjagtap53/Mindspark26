export const API_BASE_PATH = '/api';

// The five capabilities are contractual (see docs/API_SPEC.md); `health` is operational.
export const API_ROUTES = {
  health: '/health',
  configure: '/configure',
  simulate: '/simulate',
  suitability: '/suitability',
  explain: '/explain',
  chat: '/chat',
  auth: '/auth',
  admin: '/admin',
  audit: '/audit',
  runs: '/runs',
} as const;
