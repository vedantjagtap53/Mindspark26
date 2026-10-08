# SECURITY.md

Never commit credentials. Use environment variables, validate all API inputs server-side, use safe provider APIs, and avoid logging secrets or unnecessary client data. The Supabase service-role key and SDK calls are isolated to the database adapter; never expose them in controllers, services, engines, or the frontend. LLM output is never a financial calculation authority, and retrieved RAG content cannot override application instructions.

## Accounts and sessions (2026-10-07)

Passwords are stored only as salted scrypt hashes; refresh tokens only as SHA-256 hashes. Tokens live in httpOnly, SameSite=Strict cookies (`Secure` in production), never in page-readable storage or a response body. `AUTH_JWT_SECRET` is server-only and required in production. Refresh tokens rotate on every use, and a replayed one ends the session. Permissions are checked by the backend on every request (`apps/api/src/middleware/authenticate.ts`); the frontend only hides screens. `X-Payload-Hash` detects altered request bodies but is not authentication. See `docs/decisions/2026-10-07-auth-rbac.md` for the known limits.
