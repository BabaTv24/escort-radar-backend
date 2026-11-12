-- BCU products and entitlement layer.
-- Defines backend-priced products and user entitlements without changing historical wallet systems.

create table if not exists public.system_bcu_products (
  id uuid primary key default gen_random_uuid(),
  product_code text unique not null,
  display_name text not null,
  amount_bcu bigint not null check (amount_bcu > 0),
  operation_type text not null check (operation_type in ('credit', 'debit', 'transfer')),
  entitlement_type text,
  duration_days integer check (duration_days is null or duration_days > 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('client_premium', 'advertiser', 'small_business', 'vip_business', 'communication_plus')),
  status text not null check (status in ('active', 'expired', 'revoked', 'pending')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null,
  source_reference_id uuid,
  product_code text references public.system_bcu_products(product_code) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists user_entitlements_one_active_type_idx
on public.user_entitlements (user_id, entitlement_type)
where status = 'active';

create index if not exists user_entitlements_user_status_idx
on public.user_entitlements (user_id, status, entitlement_type);

create index if not exists system_bcu_products_active_idx
on public.system_bcu_products (active, product_code);

drop trigger if exists set_system_bcu_products_updated_at on public.system_bcu_products;
create trigger set_system_bcu_products_updated_at
before update on public.system_bcu_products
for each row execute procedure public.set_updated_at();

drop trigger if exists set_user_entitlements_updated_at on public.user_entitlements;
create trigger set_user_entitlements_updated_at
before update on public.user_entitlements
for each row execute procedure public.set_updated_at();

insert into public.system_bcu_products (
  product_code,
  display_name,
  amount_bcu,
  operation_type,
  entitlement_type,
  duration_days,
  active,
  metadata
)
values
  ('premium_activation_bonus', 'Premium activation bonus', 70000, 'credit', null, null, true, '{}'::jsonb),
  ('favorite_profile', 'Favorite profile', 50000, 'transfer', null, null, true, '{}'::jsonb),
  ('referral_reward', 'Referral reward', 100000, 'credit', null, null, true, '{}'::jsonb),
  ('communication_plus', 'Communication Plus', 1000000, 'debit', 'communication_plus', null, true, '{}'::jsonb),
  ('advertiser_30_days', 'Advertiser 30 days', 3332666, 'debit', 'advertiser', 30, true, '{}'::jsonb),
  ('small_business_30_days', 'Small Business 30 days', 33266666, 'debit', 'small_business', 30, true, '{}'::jsonb),
  ('vip_business_30_days', 'VIP Business 30 days', 119933333, 'debit', 'vip_business', 30, true, '{}'::jsonb)
on conflict (product_code) do update set
  display_name = excluded.display_name,
  amount_bcu = excluded.amount_bcu,
  operation_type = excluded.operation_type,
  entitlement_type = excluded.entitlement_type,
  duration_days = excluded.duration_days,
  active = excluded.active,
  updated_at = now();

create or replace function public.has_active_user_entitlement(
  p_user_id uuid,
  p_entitlement_type text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = p_user_id
      and ue.entitlement_type = p_entitlement_type
      and ue.status = 'active'
      and (ue.ends_at is null or ue.ends_at > now())
  );
$$;

create or replace function public.activate_bcu_product(
  p_user_id uuid,
  p_product_code text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.system_bcu_products%rowtype;
  v_existing_entitlement public.user_entitlements%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_ledger public.bcu_ledger_entries%rowtype;
  v_now timestamptz := now();
  v_ends_at timestamptz;
  v_safe_metadata jsonb;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_product_code, '')), '') is null then
    raise exception 'BCU_PRODUCT_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'BCU_IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_product
  from public.system_bcu_products
  where product_code = p_product_code
    and active = true;

  if not found then
    raise exception 'BCU_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type in ('advertiser', 'small_business', 'vip_business', 'communication_plus')
    and not public.has_active_user_entitlement(p_user_id, 'client_premium') then
    raise exception 'BCU_CLIENT_PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type is not null then
    perform pg_advisory_xact_lock(
      hashtext('bcu_entitlement:' || p_user_id::text),
      hashtext(v_product.entitlement_type)
    );
  end if;

  if v_product.entitlement_type = 'communication_plus' then
    select * into v_existing_entitlement
    from public.user_entitlements
    where user_id = p_user_id
      and entitlement_type = 'communication_plus'
      and status = 'active'
      and ends_at is null
    limit 1;

    if found then
      return jsonb_build_object(
        'product_code', v_product.product_code,
        'amount_bcu', v_product.amount_bcu::text,
        'charged', false,
        'ledger_entry', null,
        'entitlement', to_jsonb(v_existing_entitlement)
      );
    end if;
  end if;

  v_safe_metadata := coalesce(p_metadata, '{}'::jsonb)
    - 'amount_bcu'
    - 'price'
    - 'user_id'
    - 'status'
    - 'starts_at'
    - 'ends_at'
    - 'product_code';

  if v_product.operation_type = 'debit' then
    select * into v_ledger
    from public.apply_bcu_ledger_entry(
      p_user_id,
      v_product.amount_bcu,
      'debit',
      'bcu_product_' || v_product.product_code,
      p_idempotency_key,
      'system_bcu_product',
      v_product.id,
      'bcu',
      'system_bcu_products',
      v_product.id,
      jsonb_build_object('product_code', v_product.product_code, 'request_metadata', v_safe_metadata),
      null
    );
  elsif v_product.operation_type = 'credit' then
    select * into v_ledger
    from public.apply_bcu_ledger_entry(
      p_user_id,
      v_product.amount_bcu,
      'credit',
      'bcu_product_' || v_product.product_code,
      p_idempotency_key,
      'system_bcu_product',
      v_product.id,
      'bcu',
      'system_bcu_products',
      v_product.id,
      jsonb_build_object('product_code', v_product.product_code, 'request_metadata', v_safe_metadata),
      null
    );
  else
    raise exception 'BCU_PRODUCT_OPERATION_UNSUPPORTED' using errcode = 'P0001';
  end if;

  if not (
    v_ledger.user_id is not distinct from p_user_id
    and v_ledger.amount_bcu is not distinct from v_product.amount_bcu
    and v_ledger.direction is not distinct from v_product.operation_type
    and v_ledger.transaction_type is not distinct from ('bcu_product_' || v_product.product_code)
    and v_ledger.reference_type is not distinct from 'system_bcu_product'
    and v_ledger.reference_id is not distinct from v_product.id
    and v_ledger.source_system is not distinct from 'bcu'
    and v_ledger.source_table is not distinct from 'system_bcu_products'
    and v_ledger.source_record_id is not distinct from v_product.id
  ) then
    raise exception 'BCU_LEDGER_PRODUCT_MISMATCH' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type is null then
    return jsonb_build_object(
      'product_code', v_product.product_code,
      'amount_bcu', v_product.amount_bcu::text,
      'charged', true,
      'ledger_entry', to_jsonb(v_ledger),
      'entitlement', null
    );
  end if;

  v_ends_at := case
    when v_product.duration_days is null then null
    else v_now + make_interval(days => v_product.duration_days)
  end;

  insert into public.user_entitlements (
    user_id,
    entitlement_type,
    status,
    starts_at,
    ends_at,
    source,
    source_reference_id,
    product_code,
    metadata
  ) values (
    p_user_id,
    v_product.entitlement_type,
    'active',
    v_now,
    v_ends_at,
    'bcu_product',
    v_ledger.id,
    v_product.product_code,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'request_metadata', v_safe_metadata)
  )
  on conflict (user_id, entitlement_type) where status = 'active'
  do update set
    starts_at = case
      when public.user_entitlements.ends_at is not null and public.user_entitlements.ends_at > now()
      then public.user_entitlements.starts_at
      else excluded.starts_at
    end,
    ends_at = case
      when excluded.ends_at is null then null
      when public.user_entitlements.ends_at is not null and public.user_entitlements.ends_at > now()
      then public.user_entitlements.ends_at + make_interval(days => v_product.duration_days)
      else excluded.ends_at
    end,
    source = excluded.source,
    source_reference_id = excluded.source_reference_id,
    product_code = excluded.product_code,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_entitlement;

  return jsonb_build_object(
    'product_code', v_product.product_code,
    'amount_bcu', v_product.amount_bcu::text,
    'charged', true,
    'ledger_entry', to_jsonb(v_ledger),
    'entitlement', to_jsonb(v_entitlement)
  );
end $$;

alter table public.system_bcu_products enable row level security;
alter table public.user_entitlements enable row level security;

revoke all on public.system_bcu_products from anon, authenticated;
revoke all on public.user_entitlements from anon, authenticated;
grant select on public.system_bcu_products to authenticated;
grant select on public.user_entitlements to authenticated;
grant all on public.system_bcu_products to service_role;
grant all on public.user_entitlements to service_role;

revoke execute on function public.has_active_user_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.has_active_user_entitlement(uuid, text) to service_role;

revoke execute on function public.activate_bcu_product(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_bcu_product(uuid, text, text, jsonb) to service_role;

drop policy if exists "Users can read active BCU products" on public.system_bcu_products;
create policy "Users can read active BCU products"
on public.system_bcu_products for select
using (active = true);

drop policy if exists "Users can read own entitlements" on public.user_entitlements;
create policy "Users can read own entitlements"
on public.user_entitlements for select
using (auth.uid() = user_id);
