create table if not exists public.account_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists account_access_logs_profile_idx
on public.account_access_logs (profile_id, created_at desc);

create index if not exists account_access_logs_user_idx
on public.account_access_logs (user_id, created_at desc);
