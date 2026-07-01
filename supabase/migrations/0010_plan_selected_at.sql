-- Track one-time plan selection after first confirmed login.
alter table public.profiles
  add column if not exists plan_selected_at timestamptz;

-- Existing accounts should not be forced through onboarding again.
update public.profiles
  set plan_selected_at = coalesce(plan_selected_at, updated_at, now())
  where plan_selected_at is null;
