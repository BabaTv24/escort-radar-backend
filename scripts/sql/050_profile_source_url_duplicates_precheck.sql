-- Read-only diagnostic. Run manually before migration 050; it creates no objects.
with source_parts as (
  select
    id,
    source_url,
    pg_catalog.regexp_match(
      btrim(source_url),
      '^(https?)://([^/?#]+)([^?#]*)([?]([^#]*))?(#.*)?$',
      'i'
    ) as parts
  from public.profiles
  where nullif(btrim(source_url), '') is not null
), normalized as (
  select
    s.id,
    s.source_url,
    case
      when s.parts is null or pg_catalog.strpos(s.parts[2], '@') > 0 then null
      else pg_catalog.lower(s.parts[1]) || '://' || case
        when pg_catalog.lower(s.parts[1]) = 'https' then pg_catalog.regexp_replace(pg_catalog.lower(s.parts[2]), ':443$', '')
        when pg_catalog.lower(s.parts[1]) = 'http' then pg_catalog.regexp_replace(pg_catalog.lower(s.parts[2]), ':80$', '')
        else pg_catalog.lower(s.parts[2])
      end
        || case
          when coalesce(s.parts[3], '') in ('', '/') then '/'
          else pg_catalog.regexp_replace(s.parts[3], '/+$', '')
        end
        || case when coalesce(q.normalized_query, '') <> '' then '?' || q.normalized_query else '' end
    end as source_url_normalized
  from source_parts s
  left join lateral (
    select pg_catalog.string_agg(part, '&' order by pg_catalog.lower(pg_catalog.split_part(part, '=', 1)), part) as normalized_query
    from pg_catalog.regexp_split_to_table(coalesce(s.parts[5], ''), '&') as part
    where part <> ''
      and pg_catalog.lower(pg_catalog.split_part(part, '=', 1)) not like 'utm\_%' escape '\'
      and pg_catalog.lower(pg_catalog.split_part(part, '=', 1)) not in (
        'fbclid', 'gclid', 'dclid', 'msclkid', 'ref', 'referrer', 'source', 'campaign'
      )
  ) q on true
), duplicate_keys as (
  select source_url_normalized, count(*) as duplicate_count
  from normalized
  where source_url_normalized is not null
  group by source_url_normalized
  having count(*) > 1
)
select
  d.source_url_normalized,
  d.duplicate_count,
  n.id as profile_id,
  n.source_url
from duplicate_keys d
join normalized n using (source_url_normalized)
order by d.source_url_normalized, n.id;
