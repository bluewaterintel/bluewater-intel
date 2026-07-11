-- ============================================================================
-- Bluewater Intel — Migration 0013: owners get unlimited AI briefs again
--
-- Migration 0008 applied a hard 2/day cap to everyone (owners included) to
-- control Anthropic cost. Owners (profiles.is_owner = true) are exempt again;
-- all other paid subscribers stay at 2/day. Keeps Eastern-midnight reset and
-- row locking from 0008.
-- ============================================================================

create or replace function public.brief_consume(p_limit int default 2)
returns json language plpgsql security definer set search_path = public as $$
declare v_count int; v_day date; v_owner boolean;
begin
  if auth.uid() is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;
  -- PAID only (active / lifetime / owner). Trial + free are denied here.
  if not public.has_paid() then
    return json_build_object('allowed', false, 'reason', 'premium');
  end if;

  select coalesce(p.is_owner, false) into v_owner
    from public.profiles p where p.id = auth.uid();

  -- "Today" resets at midnight US Eastern.
  v_day := (now() at time zone 'America/New_York')::date;

  insert into public.user_brief_usage (user_id, day, count)
    values (auth.uid(), v_day, 0)
    on conflict (user_id, day) do nothing;

  select count into v_count
    from public.user_brief_usage
    where user_id = auth.uid() and day = v_day
    for update;

  -- Owners: unlimited (still tracked for admin visibility).
  if v_owner then
    update public.user_brief_usage set count = count + 1
      where user_id = auth.uid() and day = v_day;
    return json_build_object('allowed', true, 'remaining', 9999, 'limit', p_limit, 'unlimited', true);
  end if;

  if v_count >= p_limit then
    return json_build_object('allowed', false, 'reason', 'limit', 'remaining', 0, 'limit', p_limit);
  end if;

  update public.user_brief_usage set count = count + 1
    where user_id = auth.uid() and day = v_day;

  return json_build_object('allowed', true, 'remaining', p_limit - (v_count + 1), 'limit', p_limit);
end; $$;

grant execute on function public.brief_consume(int) to authenticated;
