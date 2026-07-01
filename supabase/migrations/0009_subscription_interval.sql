-- Store Stripe subscription billing interval (month/year) for UI plan labels.
alter table public.profiles
  add column if not exists subscription_interval text;
