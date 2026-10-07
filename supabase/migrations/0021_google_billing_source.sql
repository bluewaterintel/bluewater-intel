-- Android Google Play subscriptions use billing_source = 'google' (RevenueCat play_store).

alter table public.profiles drop constraint if exists profiles_billing_source_check;

alter table public.profiles add constraint profiles_billing_source_check
  check (billing_source is null or billing_source in ('stripe', 'apple', 'google'));

comment on column public.profiles.billing_source is
  'Where the user subscribed: stripe (website), apple (App Store), google (Google Play).';
