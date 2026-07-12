-- Close residual table privileges after migration 047. This migration changes no rows.
begin;

revoke insert, update, delete, truncate, references, trigger
on table public.client_referrals
from anon, authenticated;

-- Keep SELECT unchanged: the existing RLS policy limits authenticated users to their own referral row.
grant all privileges on table public.client_referrals to service_role;

alter table public.system_settings enable row level security;
revoke all privileges on table public.system_settings from anon, authenticated;
grant all privileges on table public.system_settings to service_role;

commit;
