create table if not exists public.bc_coin_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text unique not null,
  title text not null,
  coins integer not null check (coins > 0),
  bonus_coins integer not null default 0 check (bonus_coins >= 0),
  price_eur numeric(12,2) not null check (price_eur >= 0),
  currency text not null default 'EUR',
  description text,
  badge text,
  is_best_value boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  promotion_starts_at timestamptz,
  promotion_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_bc_coin_packages_updated_at on public.bc_coin_packages;
create trigger set_bc_coin_packages_updated_at
before update on public.bc_coin_packages
for each row execute procedure public.set_updated_at();

create index if not exists bc_coin_packages_active_sort_idx
on public.bc_coin_packages (is_active, sort_order, coins);

create index if not exists bc_coin_packages_promotion_idx
on public.bc_coin_packages (promotion_starts_at, promotion_ends_at)
where is_active = true;

insert into public.bc_coin_packages (
  package_key,
  title,
  coins,
  bonus_coins,
  price_eur,
  currency,
  description,
  badge,
  is_best_value,
  is_active,
  sort_order
)
values
  ('bc_66', '66 BC Coins', 66, 0, 9.99, 'EUR', 'Starter package', null, false, true, 10),
  ('bc_166', '166 BC Coins', 166, 20, 24.99, 'EUR', 'Small top-up package', null, false, true, 20),
  ('bc_666', '666 BC Coins', 666, 150, 99.99, 'EUR', 'Best value package', 'Best value', true, true, 30),
  ('bc_1200', '1200 BC Coins', 1200, 450, 180.00, 'EUR', 'Premium wallet refill', null, false, true, 40),
  ('bc_2560', '2560 BC Coins', 2560, 700, 384.00, 'EUR', 'High volume wallet refill', null, false, true, 50),
  ('bc_5200', '5200 BC Coins', 5200, 1500, 780.00, 'EUR', 'Elite wallet refill', null, false, true, 60),
  ('bc_10200', '10200 BC Coins', 10200, 3133, 1530.00, 'EUR', 'Maximum wallet refill', null, false, true, 70)
on conflict (package_key) do update set
  title = excluded.title,
  coins = excluded.coins,
  bonus_coins = excluded.bonus_coins,
  price_eur = excluded.price_eur,
  currency = excluded.currency,
  description = coalesce(public.bc_coin_packages.description, excluded.description),
  badge = coalesce(public.bc_coin_packages.badge, excluded.badge),
  is_best_value = public.bc_coin_packages.is_best_value or excluded.is_best_value,
  is_active = public.bc_coin_packages.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.bc_coin_packages enable row level security;
