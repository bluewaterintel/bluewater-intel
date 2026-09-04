-- Google Play purchases must not be tagged as Apple. Same profiles columns;
-- billing_source tells Account which store manages cancellation.

alter table public.profiles drop constraint if exists profiles_billing_source_check;

alter table public.profiles
  add constraint profiles_billing_source_check
  check (billing_source is null or billing_source in ('stripe', 'apple', 'google'));

comment on column public.profiles.billing_source is
  'Where the active subscription was purchased: stripe (website), apple (App Store), or google (Play). NULL for free/owner.';
