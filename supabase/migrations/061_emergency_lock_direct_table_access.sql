-- Emergency privacy lock (ER-V1-PRODUCTION-LAUNCH-001).
-- Production preflight found that the public anon key (shipped in every frontend bundle) could read
-- every column of every active profile (phones, owner_email, exact_address, coordinates) and every
-- profile_images row (storage paths of all gallery images) straight from PostgREST, and that anon held
-- write grants on several tables. Neither the frontend nor the backend reads these tables with the anon
-- or a user key: the backend uses the service role, which bypasses RLS and these grants. Removing direct
-- access therefore changes no application behaviour; public data stays available through the backend API.
-- Non-destructive: no rows, columns or media are touched. Reversible: see the rollback note at the end.

begin;

-- profiles: no public direct read; owners may still read their own rows; no direct writes.
drop policy if exists "Public can read active profiles" on public.profiles;
drop policy if exists "Owners can read own profiles" on public.profiles;
create policy "Owners can read own profiles" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;

-- profile_images: no public enumeration of storage paths; owners may still read their own rows.
drop policy if exists "Public can read images for visible profiles" on public.profile_images;
drop policy if exists "Owners can read own profile images" on public.profile_images;
create policy "Owners can read own profile images" on public.profile_images
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = profile_images.profile_id and p.user_id = auth.uid())
  );
revoke all on public.profile_images from anon;
revoke insert, update, delete, truncate, references, trigger on public.profile_images from authenticated;

-- Customer entitlement and favourites tables: never written directly by clients.
revoke all on public.client_activations from anon;
revoke insert, update, delete, truncate, references, trigger on public.client_activations from authenticated;
revoke all on public.client_favorites from anon;
revoke insert, update, delete, truncate, references, trigger on public.client_favorites from authenticated;

-- Legacy paid favourite RPC: SECURITY DEFINER and callable by anon with an arbitrary p_client_id.
-- Favourites are free in the V1 contract and no application code calls it.
revoke execute on function public.add_client_favorite_with_token(uuid, uuid, numeric) from public, anon, authenticated;

commit;

-- Rollback (restores the previous access exactly):
--   drop policy if exists "Owners can read own profiles" on public.profiles;
--   create policy "Public can read active profiles" on public.profiles for select using ((status = 'active') or (auth.uid() = user_id));
--   drop policy if exists "Owners can read own profile images" on public.profile_images;
--   (recreate "Public can read images for visible profiles" from the definition saved in the preflight report)
--   grant select, insert, update, delete on public.profiles, public.profile_images, public.client_activations, public.client_favorites to anon, authenticated;
--   grant execute on function public.add_client_favorite_with_token(uuid, uuid, numeric) to anon, authenticated;
