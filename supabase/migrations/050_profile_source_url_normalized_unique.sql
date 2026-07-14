create or replace function public.normalize_profile_source_url(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_match text[];
  v_scheme text;
  v_authority text;
  v_path text;
  v_query text;
  v_query_normalized text;
begin
  if btrim(p_value) = '' then
    return null;
  end if;

  v_match := pg_catalog.regexp_match(
    btrim(p_value),
    '^(https?)://([^/?#]+)([^?#]*)([?]([^#]*))?(#.*)?$',
    'i'
  );

  if v_match is null then
    return null;
  end if;

  v_scheme := pg_catalog.lower(v_match[1]);
  v_authority := pg_catalog.lower(v_match[2]);
  if pg_catalog.strpos(v_authority, '@') > 0 then
    return null;
  end if;
  if v_scheme = 'https' then
    v_authority := pg_catalog.regexp_replace(v_authority, ':443$', '');
  elsif v_scheme = 'http' then
    v_authority := pg_catalog.regexp_replace(v_authority, ':80$', '');
  end if;

  v_path := coalesce(v_match[3], '');
  if v_path = '' then
    v_path := '/';
  elsif v_path <> '/' then
    v_path := pg_catalog.regexp_replace(v_path, '/+$', '');
    if v_path = '' then v_path := '/'; end if;
  end if;

  v_query := coalesce(v_match[5], '');
  if v_query <> '' then
    select pg_catalog.string_agg(part, '&' order by pg_catalog.lower(pg_catalog.split_part(part, '=', 1)), part)
      into v_query_normalized
    from pg_catalog.regexp_split_to_table(v_query, '&') as part
    where part <> ''
      and pg_catalog.lower(pg_catalog.split_part(part, '=', 1)) not like 'utm\_%' escape '\'
      and pg_catalog.lower(pg_catalog.split_part(part, '=', 1)) not in (
        'fbclid', 'gclid', 'dclid', 'msclkid', 'ref', 'referrer', 'source', 'campaign'
      );
  end if;

  return v_scheme || '://' || v_authority || v_path
    || case when coalesce(v_query_normalized, '') <> '' then '?' || v_query_normalized else '' end;
end;
$$;

revoke all on function public.normalize_profile_source_url(text) from public, anon, authenticated;

alter table public.profiles
  add column if not exists source_url_normalized text;

update public.profiles
set source_url_normalized = public.normalize_profile_source_url(source_url)
where nullif(btrim(source_url), '') is not null;

do $$
declare
  v_duplicate_groups bigint;
  v_examples text;
begin
  select count(*) into v_duplicate_groups
  from (
    select source_url_normalized
    from public.profiles
    where source_url_normalized is not null
    group by source_url_normalized
    having count(*) > 1
  ) duplicates;

  if v_duplicate_groups > 0 then
    select pg_catalog.string_agg(source_url_normalized || ' (' || duplicate_count || ')', ', ' order by source_url_normalized)
      into v_examples
    from (
      select source_url_normalized, count(*) as duplicate_count
      from public.profiles
      where source_url_normalized is not null
      group by source_url_normalized
      having count(*) > 1
      order by source_url_normalized
      limit 10
    ) sample;

    raise exception using
      errcode = '23505',
      message = 'profiles.source_url_normalized contains ' || v_duplicate_groups || ' duplicate group(s); manual cleanup is required before migration 050 can continue. Examples: ' || coalesce(v_examples, '-');
  end if;
end;
$$;

create unique index if not exists profiles_source_url_normalized_unique_idx
  on public.profiles (source_url_normalized)
  where source_url_normalized is not null;

create or replace function public.sync_profile_source_url_normalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.source_url_normalized := public.normalize_profile_source_url(new.source_url);
  return new;
end;
$$;

revoke all on function public.sync_profile_source_url_normalized() from public, anon, authenticated;

drop trigger if exists profiles_sync_source_url_normalized on public.profiles;
create trigger profiles_sync_source_url_normalized
before insert or update of source_url on public.profiles
for each row execute function public.sync_profile_source_url_normalized();
