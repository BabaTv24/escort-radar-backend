-- 058: booking_requests are written only by the authoritative backend (service_role).
--
-- Problem: migration 004 created the policy "Anyone can create booking requests" (WITH CHECK true)
-- and anon/authenticated keep the default table grants. Anyone holding the public anon key could
-- insert a booking directly through PostgREST with any status (e.g. 'accepted'), any date, no
-- requester account and without the BC charge of create_paid_booking_request. Migration 011 also
-- lets an advertiser UPDATE every column of their bookings directly, bypassing the backend
-- status state machine.
--
-- Fix: remove direct write paths. The backend uses service_role, which bypasses RLS and is
-- unaffected. Advertisers keep read access to their own bookings through the existing
-- "Advertisers can read own booking requests" policy. No rows, columns or data are changed.
--
-- Numbering: 056/057 are taken by Escort-Radar 2.0 migrations in the shared DEV database.
-- Apply to DEV first. Production only after an explicit release decision.

begin;

drop policy if exists "Anyone can create booking requests" on public.booking_requests;
drop policy if exists "Advertisers can update own booking request status" on public.booking_requests;

revoke all on public.booking_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.booking_requests from authenticated;
grant select on public.booking_requests to authenticated;
grant all on public.booking_requests to service_role;

-- updated_at was never maintained for booking status changes.
drop trigger if exists set_booking_requests_updated_at on public.booking_requests;
create trigger set_booking_requests_updated_at
before update on public.booking_requests
for each row execute procedure public.set_updated_at();

commit;
