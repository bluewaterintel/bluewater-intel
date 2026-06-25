-- ============================================================================
-- Bluewater Intel — owner access grant
--
-- Gives the owner account full premium access and all waypoint-pack entitlements
-- without depending on Stripe checkout/webhook state.
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  home_port text,
  units text default 'imperial',
  subscription_status text not null default 'none',
  current_period_end timestamptz,
  trial_end timestamptz,
  stripe_customer_id text,
  is_owner boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.waypoint_pack_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  port text not null,
  radius_nm integer not null default 120,
  purchased_at timestamptz not null default now(),
  source text not null default 'owner_grant',
  primary key (user_id, port)
);

alter table public.waypoint_pack_entitlements enable row level security;

drop policy if exists waypoint_pack_entitlements_own_select on public.waypoint_pack_entitlements;
create policy waypoint_pack_entitlements_own_select on public.waypoint_pack_entitlements
  for select using (auth.uid() = user_id);

create or replace function public.has_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_owner = true
        or p.subscription_status in ('trialing', 'active')
        or (p.current_period_end is not null and p.current_period_end > now())
        or (p.trial_end is not null and p.trial_end > now())
      )
  );
$$;

grant execute on function public.has_premium() to authenticated;

do $$
declare
  v_user_id uuid;
  v_ports text[] := array[
    'Stonington, ME',
    'Jonesport, ME',
    'Portland, ME',
    'Kennebunkport, ME',
    'Portsmouth, NH',
    'Gloucester, MA',
    'Boston, MA',
    'Cape Cod, MA',
    'Point Judith, RI',
    'Montauk, NY',
    'Long Beach, NY',
    'Freeport, NY',
    'Toms River, NJ',
    'Atlantic City, NJ',
    'Cape May, NJ',
    'Ocean City, MD',
    'Chincoteague, VA',
    'Virginia Beach, VA',
    'Cape Charles, VA',
    'Reedville, VA',
    'Solomons, MD',
    'Colonial Beach, VA',
    'Annapolis, MD',
    'Baltimore, MD',
    'Delaware City, DE',
    'Oregon Inlet, NC',
    'Hatteras, NC',
    'Morehead City, NC',
    'Oak Island, NC',
    'Myrtle Beach, SC',
    'Murrells Inlet, SC',
    'Charleston, SC',
    'Savannah, GA',
    'Brunswick, GA',
    'St. Augustine, FL',
    'Jacksonville, FL',
    'Daytona Beach, FL',
    'Port Canaveral, FL',
    'Melbourne, FL',
    'Vero Beach, FL',
    'Stuart, FL',
    'Palm Beach, FL',
    'Fort Lauderdale, FL',
    'Miami, FL',
    'Islamorada, FL',
    'Marathon, FL',
    'Key West, FL',
    'Naples, FL',
    'Fort Myers, FL',
    'Sarasota, FL',
    'Venice, FL',
    'Clearwater, FL',
    'Tampa Bay, FL',
    'Crystal River, FL',
    'Cedar Key, FL',
    'Steinhatchee, FL',
    'Apalachicola, FL',
    'Panama City, FL',
    'Destin, FL',
    'Pensacola, FL',
    'Dauphin Island, AL',
    'Biloxi, MS',
    'Venice, LA',
    'Grand Isle, LA',
    'Houma, LA',
    'Cameron, LA',
    'Lake Charles, LA',
    'Morgan City, LA',
    'New Iberia, LA',
    'Sabine Pass, TX',
    'Galveston, TX',
    'Freeport, TX',
    'Matagorda, TX',
    'Port O''Connor, TX',
    'Port Aransas, TX',
    'Port Mansfield, TX',
    'Port Isabel, TX'
  ];
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower('rnovakwvu@gmail.com')
  limit 1;

  if v_user_id is null then
    raise exception 'Owner account rnovakwvu@gmail.com was not found in auth.users';
  end if;

  insert into public.profiles (
    id,
    display_name,
    subscription_status,
    current_period_end,
    trial_end,
    is_owner,
    updated_at
  )
  values (
    v_user_id,
    'Ron Novak',
    'active',
    now() + interval '100 years',
    now() + interval '100 years',
    true,
    now()
  )
  on conflict (id) do update
    set display_name = coalesce(public.profiles.display_name, excluded.display_name),
        subscription_status = 'active',
        current_period_end = excluded.current_period_end,
        trial_end = excluded.trial_end,
        is_owner = true,
        updated_at = now();

  insert into public.waypoint_pack_entitlements (user_id, port, radius_nm, purchased_at, source)
  select v_user_id, port_name, 120, now(), 'owner_grant'
  from unnest(v_ports) as port_name
  on conflict (user_id, port) do update
    set radius_nm = greatest(public.waypoint_pack_entitlements.radius_nm, excluded.radius_nm),
        source = 'owner_grant';
end $$;
