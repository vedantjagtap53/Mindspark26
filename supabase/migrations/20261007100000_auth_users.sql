-- Users, roles and refresh tokens (approved scope addition 2026-10-07; docs/decisions/2026-10-07-auth-rbac.md).
-- Accessed only by the API's Supabase adapter with the service-role key; RLS is on with no
-- policies, so anon and authenticated keys see nothing.
--
-- - Passwords are stored only as salted scrypt hashes (never plain text).
-- - Refresh tokens are stored only as SHA-256 hashes of the random cookie value. Each login starts
--   a family; rotation links the old token to its successor (replaced_by) so that replaying a
--   used token can revoke the whole family.
-- - These tables are not audit evidence: users can be deactivated and tokens revoked.

create type public.user_role as enum ('RM', 'COMPLIANCE', 'ADMIN');

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  -- Stored lowercase by the API; the unique index below also guards against case variants.
  email varchar(254) not null,
  display_name varchar(80) not null,
  password_hash text not null,
  role public.user_role not null default 'RM',
  active boolean not null default true,
  -- { theme: 'light' | 'dark' | 'system', customCursor: boolean }; validated by the API.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index app_users_email_key on public.app_users (lower(email));

-- 20261004130000 dropped touch_updated_at() together with client_profiles, so it is recreated here.
create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger app_users_touch_updated_at
  before update on public.app_users
  for each row execute function public.touch_updated_at();

create table public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  family_id uuid not null,
  -- Hex SHA-256 of the token value held in the cookie.
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references public.refresh_tokens (id),
  created_at timestamptz not null default now()
);

create index refresh_tokens_user_id_idx on public.refresh_tokens (user_id);
create index refresh_tokens_family_id_idx on public.refresh_tokens (family_id);

alter table public.app_users enable row level security;
alter table public.refresh_tokens enable row level security;
