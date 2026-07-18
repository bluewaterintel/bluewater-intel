-- ============================================================================
-- Bluewater Intel — Migration 0016: one free trial per customer
--
-- Survives account deletion so "trial → delete → re-signup → trial" abuse is
-- blocked. Only gates starting a NEW 7-day trial (stripe-checkout with
-- trial:true). Does NOT affect:
--   • Continuing on Free after signup (no checkout)
--   • Canceling a paid/trial subscription → Free
--   • Paying Monthly/Annual without a trial
-- ============================================================================

create table if not exists public.trial_consumed (
  email_normalized text primary key,
  card_fingerprint text,
  user_id uuid,
  stripe_customer_id text,
  consumed_at timestamptz not null default now(),
  source text not null default 'stripe_trial'
);

create index if not exists trial_consumed_fingerprint_idx
  on public.trial_consumed (card_fingerprint)
  where card_fingerprint is not null;

create index if not exists trial_consumed_user_id_idx
  on public.trial_consumed (user_id)
  where user_id is not null;

alter table public.trial_consumed enable row level security;

-- No policies for anon/authenticated — only service_role (edge functions)
-- may read/write. Account deletion must NOT wipe these rows.

comment on table public.trial_consumed is
  'Registry of emails/cards that already used the 7-day free trial. Persists after account delete.';
