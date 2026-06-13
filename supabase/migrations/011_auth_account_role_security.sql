alter table public.profiles
  add column if not exists plan text,
  add column if not exists tokens_balance numeric default 0;

update public.profiles
set plan = listing_plan
where plan is null
  and listing_plan is not null;

create or replace function public.current_auth_account_type()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'auth_account_type', ''), 'client');
$$;

create or replace function public.current_auth_plan()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'plan', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'listing_plan', ''),
    ''
  );
$$;

create or replace function public.current_auth_subscription_status()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'subscription_status', ''), '');
$$;

create or replace function public.has_active_advertiser_access()
returns boolean
language sql
stable
as $$
  select (
    public.current_auth_subscription_status() = 'active'
    and (
      (public.current_auth_account_type() = 'escort' and public.current_auth_plan() = 'escort_monthly')
      or
      (public.current_auth_account_type() = 'business' and public.current_auth_plan() = 'business_monthly')
    )
  );
$$;

create or replace function public.set_default_auth_account_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb);

  if coalesce(new.raw_app_meta_data ->> 'auth_account_type', '') not in ('client', 'escort', 'business') then
    new.raw_app_meta_data = new.raw_app_meta_data || jsonb_build_object('auth_account_type', 'client');
  end if;

  if coalesce(new.raw_app_meta_data ->> 'subscription_status', '') = '' then
    new.raw_app_meta_data = new.raw_app_meta_data || jsonb_build_object('subscription_status', 'free');
  end if;

  return new;
end;
$$;

drop trigger if exists set_default_auth_account_metadata on auth.users;
create trigger set_default_auth_account_metadata
before insert on auth.users
for each row
execute function public.set_default_auth_account_metadata();

drop policy if exists "Users can insert own profiles" on public.profiles;
create policy "Users can insert own advertiser profiles"
on public.profiles for insert
with check (
  auth.uid() = user_id
  and public.has_active_advertiser_access()
  and subscription_status = 'active'
  and (
    (public.current_auth_account_type() = 'escort' and plan = 'escort_monthly')
    or
    (public.current_auth_account_type() = 'business' and plan = 'business_monthly')
  )
);

drop policy if exists "Users can update own non-moderation fields" on public.profiles;
create policy "Users can update own advertiser profiles"
on public.profiles for update
using (
  auth.uid() = user_id
  and public.has_active_advertiser_access()
)
with check (
  auth.uid() = user_id
  and public.has_active_advertiser_access()
  and subscription_status = 'active'
  and (
    (public.current_auth_account_type() = 'escort' and plan = 'escort_monthly')
    or
    (public.current_auth_account_type() = 'business' and plan = 'business_monthly')
  )
);

drop policy if exists "Users can delete own profiles" on public.profiles;
create policy "Users can delete own advertiser profiles"
on public.profiles for delete
using (
  auth.uid() = user_id
  and public.has_active_advertiser_access()
);

drop policy if exists "Users can manage images for own profiles" on public.profile_images;
create policy "Users can manage images for own advertiser profiles"
on public.profile_images for all
using (
  public.has_active_advertiser_access()
  and exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
)
with check (
  public.has_active_advertiser_access()
  and exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
);

drop policy if exists "Profile owners can read booking requests" on public.booking_requests;
create policy "Advertisers can read own booking requests"
on public.booking_requests for select
using (
  public.has_active_advertiser_access()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
);

drop policy if exists "Profile owners can update booking request status" on public.booking_requests;
create policy "Advertisers can update own booking request status"
on public.booking_requests for update
using (
  public.has_active_advertiser_access()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
)
with check (
  public.has_active_advertiser_access()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
);

create index if not exists profiles_plan_idx on public.profiles (plan);
