BEGIN;

-- PREVIEW: exact rows that the UPDATE below will change, grouped by city and current country.
SELECT
  work_city,
  COALESCE(work_country, '<NULL>') AS current_work_country,
  COUNT(*) AS profiles_to_change
FROM profiles
WHERE translate(
        lower(regexp_replace(btrim(work_city), '\s+', ' ', 'g')),
        U&'\0105\0107\0119\0142\0144\00f3\015b\017a\017c',
        'acelnoszz'
      ) = ANY (ARRAY[
        'bydgoszcz',
        'kolobrzeg',
        'koszalin',
        'stargard',
        'stargard szczecinski',
        'szczecin',
        'poznan'
      ])
  AND work_country IS DISTINCT FROM 'PL'
GROUP BY work_city, work_country
ORDER BY work_city, current_work_country;

-- PREVIEW: one exact total for the pending correction.
SELECT COUNT(*) AS exact_profiles_to_change
FROM profiles
WHERE translate(
        lower(regexp_replace(btrim(work_city), '\s+', ' ', 'g')),
        U&'\0105\0107\0119\0142\0144\00f3\015b\017a\017c',
        'acelnoszz'
      ) = ANY (ARRAY[
        'bydgoszcz',
        'kolobrzeg',
        'koszalin',
        'stargard',
        'stargard szczecinski',
        'szczecin',
        'poznan'
      ])
  AND work_country IS DISTINCT FROM 'PL';

WITH updated AS (
  UPDATE profiles
  SET work_country = 'PL'
  WHERE translate(
          lower(regexp_replace(btrim(work_city), '\s+', ' ', 'g')),
          U&'\0105\0107\0119\0142\0144\00f3\015b\017a\017c',
          'acelnoszz'
        ) = ANY (ARRAY[
          'bydgoszcz',
          'kolobrzeg',
          'koszalin',
          'stargard',
          'stargard szczecinski',
          'szczecin',
          'poznan'
        ])
    AND work_country IS DISTINCT FROM 'PL'
  RETURNING id
)
SELECT COUNT(*) AS updated_profiles FROM updated;

-- CONTROL: all matching cities must now be PL; non-PL count must be zero.
SELECT
  work_city,
  COALESCE(work_country, '<NULL>') AS work_country,
  COUNT(*) AS profiles_after_update
FROM profiles
WHERE translate(
        lower(regexp_replace(btrim(work_city), '\s+', ' ', 'g')),
        U&'\0105\0107\0119\0142\0144\00f3\015b\017a\017c',
        'acelnoszz'
      ) = ANY (ARRAY[
        'bydgoszcz',
        'kolobrzeg',
        'koszalin',
        'stargard',
        'stargard szczecinski',
        'szczecin',
        'poznan'
      ])
GROUP BY work_city, work_country
ORDER BY work_city, work_country;

SELECT COUNT(*) AS remaining_non_pl_profiles
FROM profiles
WHERE translate(
        lower(regexp_replace(btrim(work_city), '\s+', ' ', 'g')),
        U&'\0105\0107\0119\0142\0144\00f3\015b\017a\017c',
        'acelnoszz'
      ) = ANY (ARRAY[
        'bydgoszcz',
        'kolobrzeg',
        'koszalin',
        'stargard',
        'stargard szczecinski',
        'szczecin',
        'poznan'
      ])
  AND work_country IS DISTINCT FROM 'PL';

COMMIT;
