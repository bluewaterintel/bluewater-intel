-- ============================================================================
-- Bluewater Intel — Milestone 2: Auth + user data (RLS)
-- Account-scoped waypoints, catches, and small logs. Requires Supabase Auth.
-- ============================================================================

-- ── User waypoints (personal database) ──────────────────────────────────────
create table if not exists public.user_waypoints (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists user_waypoints_user_idx on public.user_waypoints (user_id);

-- ── User catches ────────────────────────────────────────────────────────────
create table if not exists public.user_catches (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists user_catches_user_idx on public.user_catches (user_id);

-- ── Small logs (catch meter, tide favorites) ────────────────────────────────
create table if not exists public.user_logs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_key    text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_key)
);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.user_waypoints enable row level security;
alter table public.user_catches enable row level security;
alter table public.user_logs enable row level security;

drop policy if exists user_waypoints_own on public.user_waypoints;
create policy user_waypoints_own on public.user_waypoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_catches_own on public.user_catches;
create policy user_catches_own on public.user_catches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_logs_own on public.user_logs;
create policy user_logs_own on public.user_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
