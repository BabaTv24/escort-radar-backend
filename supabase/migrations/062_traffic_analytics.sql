-- ER-V1-PUBLIC-PREVIEW-001: privacy-conscious traffic analytics.
--
-- Pseudonymous, not anonymous (GDPR Art. 4(5)): while the daily salt exists, the backend could recompute a
-- visitor_hash from an address and user agent. Measures:
--   * no IP address, user agent, cookie, account id or e-mail is stored;
--   * visitor_hash = SHA-256(daily salt + client address + user agent), truncated. The salt is random per
--     Berlin calendar day and destroyed after the following day; afterwards hashes can no longer be recomputed
--     or linked across days. Unique visitors are therefore estimated per day only.
--   * profile views carry no visitor_hash and an hour-level timestamp: views of a specific advertiser are
--     counted per profile and cannot be linked to a visitor's other events;
--   * raw events are deleted after 60 days (prune_traffic_analytics, run by the backend every 6 hours).
-- Collection is off unless ANALYTICS_COLLECTION_ENABLED=true. Only the backend (service_role) has access.

create table if not exists public.traffic_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_day date not null default ((now() at time zone 'Europe/Berlin')::date),
  event_type text not null check (event_type in ('page_view', 'radar_view', 'city_search', 'profile_view', 'premium_cta_click', 'advertiser_cta_click')),
  path text check (path is null or char_length(path) <= 120),
  city text check (city is null or char_length(city) <= 80),
  profile_ref text check (profile_ref is null or char_length(profile_ref) <= 120),
  source text check (source is null or char_length(source) <= 80),
  device text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  visitor_hash text
);

-- Idempotent shape rules (also upgrade a pre-release copy of this table).
alter table public.traffic_events alter column visitor_hash drop not null;
update public.traffic_events set visitor_hash = null where event_type = 'profile_view' and visitor_hash is not null;
alter table public.traffic_events drop constraint if exists traffic_events_visitor_hash_check;
alter table public.traffic_events drop constraint if exists traffic_events_visitor_hash_rule;
alter table public.traffic_events add constraint traffic_events_visitor_hash_rule check (
  (event_type = 'profile_view' and visitor_hash is null)
  or (event_type <> 'profile_view' and visitor_hash ~ '^[0-9a-f]{32}$')
);

create index if not exists traffic_events_day_type_idx on public.traffic_events (event_day, event_type);
create index if not exists traffic_events_occurred_at_idx on public.traffic_events (occurred_at);

alter table public.traffic_events enable row level security;
revoke all on public.traffic_events from anon, authenticated;

create table if not exists public.traffic_salts (
  day date primary key,
  salt text not null check (char_length(salt) >= 32),
  created_at timestamptz not null default now()
);

alter table public.traffic_salts enable row level security;
revoke all on public.traffic_salts from anon, authenticated;

create or replace function public.prune_traffic_analytics(p_retention_days integer default 60)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.traffic_events
  where occurred_at < now() - make_interval(days => greatest(p_retention_days, 1));
  get diagnostics v_deleted = row_count;
  -- Yesterday's salt is kept so a visit around midnight still hashes consistently; older salts are destroyed.
  delete from public.traffic_salts
  where day < ((now() at time zone 'Europe/Berlin')::date - 1);
  return v_deleted;
end;
$$;

-- security definer: reads auth.users for the exact new-account counts. Execution is granted to service_role only.
create or replace function public.traffic_summary(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      ((now() at time zone 'Europe/Berlin')::date) as today,
      ((now() at time zone 'Europe/Berlin')::date - (least(greatest(p_days, 1), 60) - 1)) as first_day
  ),
  days as (
    select generate_series(b.first_day, b.today, interval '1 day')::date as day from bounds b
  ),
  scoped as (
    select e.* from public.traffic_events e, bounds b where e.event_day between b.first_day and b.today
  ),
  daily as (
    select
      d.day,
      count(s.id) filter (where s.event_type = 'page_view') as page_views,
      count(distinct s.visitor_hash) as visitors,
      count(s.id) filter (where s.event_type = 'radar_view') as radar_views,
      count(s.id) filter (where s.event_type = 'city_search') as city_searches,
      count(s.id) filter (where s.event_type = 'profile_view') as profile_views,
      count(s.id) filter (where s.event_type = 'premium_cta_click') as premium_cta,
      count(s.id) filter (where s.event_type = 'advertiser_cta_click') as advertiser_cta
    from days d
    left join scoped s on s.event_day = d.day
    group by d.day
  ),
  -- 7/30-day windows and the equal-length windows before them, for trends (raw retention is 60 days).
  windows as (
    select w.name, w.len, b.today - (w.len - 1) as cur_from, b.today as cur_to,
           b.today - (2 * w.len - 1) as prev_from, b.today - w.len as prev_to
    from bounds b, (values ('7d', 7), ('30d', 30)) as w(name, len)
  ),
  per_day_visitors as (
    select event_day, count(distinct visitor_hash) as visitors from public.traffic_events group by event_day
  ),
  trends as (
    select jsonb_object_agg(w.name, jsonb_build_object(
      'page_views', (select count(*) from public.traffic_events e where e.event_type = 'page_view' and e.event_day between w.cur_from and w.cur_to),
      'page_views_previous', (select count(*) from public.traffic_events e where e.event_type = 'page_view' and e.event_day between w.prev_from and w.prev_to),
      'visitor_days', (select coalesce(sum(v.visitors), 0) from per_day_visitors v where v.event_day between w.cur_from and w.cur_to),
      'visitor_days_previous', (select coalesce(sum(v.visitors), 0) from per_day_visitors v where v.event_day between w.prev_from and w.prev_to),
      'radar_views', (select count(*) from public.traffic_events e where e.event_type = 'radar_view' and e.event_day between w.cur_from and w.cur_to),
      'city_searches', (select count(*) from public.traffic_events e where e.event_type = 'city_search' and e.event_day between w.cur_from and w.cur_to),
      'profile_views', (select count(*) from public.traffic_events e where e.event_type = 'profile_view' and e.event_day between w.cur_from and w.cur_to),
      'premium_cta', (select count(*) from public.traffic_events e where e.event_type = 'premium_cta_click' and e.event_day between w.cur_from and w.cur_to),
      'advertiser_cta', (select count(*) from public.traffic_events e where e.event_type = 'advertiser_cta_click' and e.event_day between w.cur_from and w.cur_to),
      'new_client_accounts', (select count(*) from auth.users u where (u.created_at at time zone 'Europe/Berlin')::date between w.cur_from and w.cur_to and coalesce(u.raw_app_meta_data ->> 'auth_account_type', 'client') = 'client'),
      'new_advertiser_accounts', (select count(*) from auth.users u where (u.created_at at time zone 'Europe/Berlin')::date between w.cur_from and w.cur_to and u.raw_app_meta_data ->> 'auth_account_type' in ('escort', 'business'))
    )) as value
    from windows w
  )
  select jsonb_build_object(
    'days', least(greatest(p_days, 1), 60),
    'first_day', (select first_day from bounds),
    'last_day', (select today from bounds),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'trends', (select value from trends),
    'top_cities', coalesce((
      select jsonb_agg(c order by c.searches + c.views desc, c.city) from (
        select s.city,
               count(*) filter (where s.event_type = 'city_search') as searches,
               count(*) filter (where s.event_type = 'page_view') as views
        from scoped s where s.city is not null group by s.city
        order by count(*) desc limit 10
      ) c), '[]'::jsonb),
    'top_profiles', coalesce((
      select jsonb_agg(t order by t.views desc) from (
        select s.profile_ref, count(*) as views,
               p.id as profile_id, p.display_name, p.city
        from scoped s
        left join public.profiles p on p.id::text = s.profile_ref or p.slug = s.profile_ref
        where s.event_type = 'profile_view' and s.profile_ref is not null
        group by s.profile_ref, p.id, p.display_name, p.city
        order by count(*) desc limit 10
      ) t), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(x order by x.page_views desc) from (
        select coalesce(s.source, 'direct') as source, count(*) as page_views
        from scoped s where s.event_type = 'page_view' and coalesce(s.source, 'direct') <> 'internal'
        group by 1 order by 2 desc limit 10
      ) x), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(x order by x.page_views desc) from (
        select coalesce(s.device, 'unknown') as device, count(*) as page_views
        from scoped s where s.event_type = 'page_view' group by 1
      ) x), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(x order by x.page_views desc) from (
        select coalesce(s.country, 'unknown') as country, count(*) as page_views
        from scoped s where s.event_type = 'page_view' group by 1 order by 2 desc limit 10
      ) x), '[]'::jsonb)
  );
$$;

revoke all on function public.traffic_summary(integer) from public, anon, authenticated;
revoke all on function public.prune_traffic_analytics(integer) from public, anon, authenticated;
grant execute on function public.traffic_summary(integer) to service_role;
grant execute on function public.prune_traffic_analytics(integer) to service_role;
