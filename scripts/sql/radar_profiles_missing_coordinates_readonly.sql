-- READ ONLY: inventory for a separately reviewed city-based geocoding backfill.
-- This report does not update profiles and deliberately does not assign a Berlin fallback.
select
  p.id,
  p.display_name,
  p.status,
  p.moderation_status,
  p.is_published,
  p.shadowbanned,
  p.work_country,
  p.work_city,
  p.city,
  p.work_area,
  p.postal_code,
  p.location_mode,
  p.location_visibility,
  p.latitude,
  p.longitude,
  p.import_source,
  p.source_url
from public.profiles p
where
  (p.latitude is null or p.longitude is null or (p.latitude = 0 and p.longitude = 0))
  and (
    lower(coalesce(p.work_country, '')) in ('poland', 'polska', 'pl')
    or p.import_source is not null
  )
order by p.work_country, coalesce(p.work_city, p.city), p.id;
