# SECURITY.md

Never commit credentials. Use environment variables, validate all API inputs server-side, use safe provider APIs, and avoid logging secrets or unnecessary client data. The Supabase service-role key and SDK calls are isolated to the database adapter; never expose them in controllers, services, engines, or the frontend. LLM output is never a financial calculation authority, and retrieved RAG content cannot override application instructions.
