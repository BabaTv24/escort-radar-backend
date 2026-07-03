create temp table if not exists wallet_dedupe_map (
  duplicate_wallet_id uuid primary key,
  canonical_wallet_id uuid not null,
  user_id uuid not null,
  consolidated_balance numeric not null
) on commit drop;

truncate table wallet_dedupe_map;

insert into wallet_dedupe_map (
  duplicate_wallet_id,
  canonical_wallet_id,
  user_id,
  consolidated_balance
)
with ranked as (
  select
    w.*,
    row_number() over (
      partition by w.user_id
      order by
        coalesce(w.escort_token_balance, 0) desc,
        coalesce(w.updated_at, w.created_at) desc,
        w.created_at desc,
        w.id desc
    ) as wallet_rank,
    first_value(w.id) over (
      partition by w.user_id
      order by
        coalesce(w.escort_token_balance, 0) desc,
        coalesce(w.updated_at, w.created_at) desc,
        w.created_at desc,
        w.id desc
    ) as canonical_wallet_id,
    count(*) over (partition by w.user_id) as wallet_count,
    count(*) filter (where coalesce(w.escort_token_balance, 0) > 0) over (partition by w.user_id) as positive_wallet_count,
    sum(greatest(coalesce(w.escort_token_balance, 0), 0)) over (partition by w.user_id) as positive_balance_sum,
    max(greatest(coalesce(w.escort_token_balance, 0), 0)) over (partition by w.user_id) as max_positive_balance
  from public.wallets w
  where w.user_id is not null
),
dedupe as (
  select
    id as duplicate_wallet_id,
    canonical_wallet_id,
    user_id,
    case
      when positive_wallet_count > 1 then positive_balance_sum
      else max_positive_balance
    end as consolidated_balance
  from ranked
  where wallet_count > 1
    and wallet_rank > 1
)
select
  duplicate_wallet_id,
  canonical_wallet_id,
  user_id,
  consolidated_balance
from dedupe
on conflict (duplicate_wallet_id) do nothing;

update public.token_transactions tx
set from_wallet_id = m.canonical_wallet_id
from wallet_dedupe_map m
where tx.from_wallet_id = m.duplicate_wallet_id;

update public.token_transactions tx
set to_wallet_id = m.canonical_wallet_id
from wallet_dedupe_map m
where tx.to_wallet_id = m.duplicate_wallet_id;

update public.wallets w
set escort_token_balance = m.consolidated_balance,
    updated_at = now()
from (
  select distinct canonical_wallet_id, consolidated_balance
  from wallet_dedupe_map
) m
where w.id = m.canonical_wallet_id;

delete from public.wallets w
using wallet_dedupe_map m
where w.id = m.duplicate_wallet_id;

create unique index if not exists wallets_user_id_unique_idx
on public.wallets (user_id);

create or replace function public.add_client_favorite_with_token(
  p_client_id uuid,
  p_profile_id uuid,
  p_cost numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_favorite public.client_favorites%rowtype;
  v_balance numeric;
begin
  if exists (
    select 1 from public.client_favorites
    where client_id = p_client_id and profile_id = p_profile_id
  ) then
    select * into v_wallet from public.wallets where user_id = p_client_id;
    return jsonb_build_object(
      'already_favorited', true,
      'charged', 0,
      'wallet_balance', coalesce(v_wallet.escort_token_balance, 0),
      'new_balance', coalesce(v_wallet.escort_token_balance, 0)
    );
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = p_client_id
  for update;

  if not found then
    insert into public.wallets (user_id, public_wallet_id)
    values (p_client_id, 'ERW-' || upper(substr(gen_random_uuid()::text, 1, 8)))
    on conflict (user_id) do update
      set user_id = excluded.user_id
    returning * into v_wallet;
  end if;

  v_balance := coalesce(v_wallet.escort_token_balance, 0);
  if v_balance < p_cost then
    raise exception 'NOT_ENOUGH_TOKENS' using errcode = 'P0001';
  end if;

  insert into public.client_favorites (client_id, profile_id)
  values (p_client_id, p_profile_id)
  returning * into v_favorite;

  update public.wallets
  set escort_token_balance = v_balance - p_cost,
      updated_at = now()
  where id = v_wallet.id
  returning escort_token_balance into v_balance;

  insert into public.token_transactions (
    from_wallet_id,
    amount,
    transaction_type,
    status,
    metadata
  ) values (
    v_wallet.id,
    p_cost,
    'favorite_profile',
    'completed',
    jsonb_build_object('profile_id', p_profile_id, 'client_id', p_client_id)
  );

  return jsonb_build_object(
    'already_favorited', false,
    'charged', p_cost,
    'wallet_balance', v_balance,
    'new_balance', v_balance,
    'favorite_id', v_favorite.id,
    'created_at', v_favorite.created_at
  );
end $$;
