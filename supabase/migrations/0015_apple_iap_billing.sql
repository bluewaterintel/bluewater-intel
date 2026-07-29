-- ============================================================================
-- Bluewater Intel — Migration 0015: Apple IAP billing source
--
-- Unified entitlements: both Stripe (website) and Apple (iOS App Store) write
-- to the same profiles.subscription_status / current_period_end fields.
-- billing_source records where the user subscribed so each platform can show
-- the correct "manage subscription" path (Stripe portal vs App Store settings).
-- ============================================================================

alter table public.profiles
  add column if not exists billing_source text
    check (billing_source is null or billing_source in ('stripe', 'apple'));

alter table public.profiles
  add column if not exists apple_original_transaction_id text;

create unique index if not exists profiles_apple_original_tx_uidx
  on public.profiles (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.profiles.billing_source is
  'Where the active subscription was purchased: stripe (website) or apple (App Store). NULL for free/owner.';

comment on column public.profiles.apple_original_transaction_id is
  'Apple StoreKit original_transaction_id — stable across renewals; used by App Store Server Notifications.';

-- has_premium() already keys off subscription_status / period_end — no change needed.
-- Both Stripe webhook and Apple IAP sync write those same columns.
