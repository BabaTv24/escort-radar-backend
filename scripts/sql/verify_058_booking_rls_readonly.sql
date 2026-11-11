-- READ-ONLY verification for migration 058 (safe on production: SELECT only).

-- 1. Policies on booking_requests. After 058 only the SELECT policy may remain.
select policyname, cmd, roles::text as roles, with_check
from pg_policies
where schemaname = 'public' and tablename = 'booking_requests'
order by policyname;

-- 2. Table privileges. After 058: anon none; authenticated SELECT only.
select grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'booking_requests'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee
order by grantee;

-- 3. updated_at trigger present.
select tgname from pg_trigger
where tgrelid = 'public.booking_requests'::regclass and not tgisinternal;

-- 4. Rows that could only have come from a direct write (no requester account, no idempotency key).
--    Informational: before 058 the non-BCU backend path also wrote such rows.
select status, count(*) as rows, min(created_at) as first_at, max(created_at) as last_at
from public.booking_requests
where requester_user_id is null and client_request_key is null
group by status
order by status;
