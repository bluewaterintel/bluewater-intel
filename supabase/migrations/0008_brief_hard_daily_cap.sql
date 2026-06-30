-- ============================================================================
-- Bluewater Intel — Migration 0008: hard 2-per-day cap on the AI Captain's Brief
--
-- WHY: the previous brief_consume() gave OWNERS unlimited briefs, so an owner
-- account could run the Anthropic key well past the intended limit. To control
-- cost, the cap is now a HARD limit that applies to EVERYONE who is allowed to
-- call it — owners included.
--
-- WHO can call it (unchanged): PAID only — active subscription, lifetime, or
-- owner. Trial and free accounts get 'premium' denied.
--
-- RESET: the daily counter rolls over at LOCAL midnight (US Eastern) so the two
-- briefs renew each night for this app's audience, instead of at 00:00 UTC.
--
-- CONCURRENCY: the usage row is locked (FOR UPDATE) before the count check so two
-- near-simultaneous requests can't both slip past the limit.
-- ============================================================================

create or replace function public.brief_consume(p_limit int default 2)
returns json language plpgsql security definer set search_path = public as $$
declare v_count int; v_day date;
begin
  if auth.uid() is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;
  -- PAID only (active / lifetime / owner). Trial + free are denied here.
  if not public.has_paid() then
    return json_build_object('allowed', false, 'reason', 'premium');
  end if;

  -- "Today" resets at midnight US Eastern.
  v_day := (now() at time zone 'America/New_York')::date;

  insert into public.user_brief_usage (user_id, day, count)
    values (auth.uid(), v_day, 0)
    on conflict (user_id, day) do nothing;

  -- Lock the row so concurrent calls serialize on the count.
  select count into v_count
    from public.user_brief_usage
    where user_id = auth.uid() and day = v_day
    for update;

  -- HARD cap for everyone (owners included).
  if v_count >= p_limit then
    return json_build_object('allowed', false, 'reason', 'limit', 'remaining', 0, 'limit', p_limit);
  end if;

  update public.user_brief_usage set count = count + 1
    where user_id = auth.uid() and day = v_day;

  return json_build_object('allowed', true, 'remaining', p_limit - (v_count + 1), 'limit', p_limit);
end; $$;

grant execute on function public.brief_consume(int) to authenticated;
