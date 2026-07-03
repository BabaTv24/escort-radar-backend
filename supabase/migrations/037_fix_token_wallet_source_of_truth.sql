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
