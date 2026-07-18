-- ============================================================================
-- Bluewater Intel — Migration 0015: one AI Captain's Brief per 7-day trial
--
--   • Free accounts: still no brief (unchanged).
--   • Trialing accounts: exactly 1 brief for the whole trial (lifetime sum).
--   • Paid (active / lifetime / owner): 2/day (owners unlimited via 0013).
--   • brief_allowance(): read-only quota for the client UI (no consume).
-- ============================================================================

create or replace function public.brief_allowance()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_status text;
  v_owner boolean;
  v_day date;
  v_count int;
  v_trial_total int;
begin
  if auth.uid() is null then
    return json_build_object('tier', 'free', 'allowed', false, 'remaining', 0, 'limit', 0);
  end if;

  select coalesce(p.is_owner, false), coalesce(p.subscription_status, 'none')
    into v_owner, v_status
    from public.profiles p where p.id = auth.uid();

  if v_owner then
    return json_build_object('tier', 'paid', 'allowed', true, 'remaining', 9999, 'limit', 2, 'unlimited', true);
  end if;

  if v_status in ('active', 'lifetime') then
    v_day := (now() at time zone 'America/New_York')::date;
    select coalesce(count, 0) into v_count
      from public.user_brief_usage
      where user_id = auth.uid() and day = v_day;
    return json_build_object(
      'tier', 'paid', 'allowed', true,
      'remaining', greatest(0, 2 - v_count),
      'limit', 2
    );
  end if;

  if v_status = 'trialing' then
    select coalesce(sum(count), 0) into v_trial_total
      from public.user_brief_usage where user_id = auth.uid();
    return json_build_object(
      'tier', 'trial', 'allowed', v_trial_total < 1,
      'remaining', greatest(0, 1 - v_trial_total),
      'limit', 1
    );
  end if;

  return json_build_object('tier', 'free', 'allowed', false, 'remaining', 0, 'limit', 0);
end; $$;

grant execute on function public.brief_allowance() to authenticated;

create or replace function public.brief_consume(p_limit int default 2)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_day date;
  v_owner boolean;
  v_status text;
  v_trial_total int;
begin
  if auth.uid() is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;

  select coalesce(p.is_owner, false), coalesce(p.subscription_status, 'none')
    into v_owner, v_status
    from public.profiles p where p.id = auth.uid();

  v_day := (now() at time zone 'America/New_York')::date;

  insert into public.user_brief_usage (user_id, day, count)
    values (auth.uid(), v_day, 0)
    on conflict (user_id, day) do nothing;

  -- Owners: unlimited (still tracked for admin visibility).
  if v_owner then
    select count into v_count
      from public.user_brief_usage
      where user_id = auth.uid() and day = v_day
      for update;
    update public.user_brief_usage set count = count + 1
      where user_id = auth.uid() and day = v_day;
    return json_build_object('allowed', true, 'remaining', 9999, 'limit', p_limit, 'unlimited', true);
  end if;

  -- Paid subscribers: 2/day Eastern reset.
  if v_status in ('active', 'lifetime') then
    select count into v_count
      from public.user_brief_usage
      where user_id = auth.uid() and day = v_day
      for update;
    if v_count >= p_limit then
      return json_build_object('allowed', false, 'reason', 'limit', 'remaining', 0, 'limit', p_limit);
    end if;
    update public.user_brief_usage set count = count + 1
      where user_id = auth.uid() and day = v_day;
    return json_build_object('allowed', true, 'remaining', p_limit - (v_count + 1), 'limit', p_limit);
  end if;

  -- 7-day trial: one brief for the entire trial period.
  if v_status = 'trialing' then
    select coalesce(sum(count), 0) into v_trial_total
      from public.user_brief_usage where user_id = auth.uid();
    if v_trial_total >= 1 then
      return json_build_object('allowed', false, 'reason', 'trial_limit', 'remaining', 0, 'limit', 1);
    end if;
    select count into v_count
      from public.user_brief_usage
      where user_id = auth.uid() and day = v_day
      for update;
    update public.user_brief_usage set count = count + 1
      where user_id = auth.uid() and day = v_day;
    return json_build_object('allowed', true, 'remaining', 0, 'limit', 1, 'trial', true);
  end if;

  -- Free / lapsed: no brief.
  return json_build_object('allowed', false, 'reason', 'premium');
end; $$;

grant execute on function public.brief_consume(int) to authenticated;
