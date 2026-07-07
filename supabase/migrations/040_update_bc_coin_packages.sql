-- Align BC Coins packages with the current Escort Radar sales catalog.

update public.token_packages
set active = false, featured = false
where token_amount in (120, 520);

update public.token_packages
set
  name = '1200 BC Coins',
  eur_price = 180.00,
  bonus_tokens = 450,
  featured = false,
  active = true
where token_amount = 1200;

update public.token_packages
set
  name = '2560 BC Coins',
  eur_price = 384.00,
  bonus_tokens = 700,
  featured = false,
  active = true
where token_amount = 2560;

update public.token_packages
set
  name = '5200 BC Coins',
  eur_price = 780.00,
  bonus_tokens = 1500,
  featured = false,
  active = true
where token_amount = 5200;

update public.token_packages
set
  name = '10200 BC Coins',
  eur_price = 1530.00,
  bonus_tokens = 3133,
  featured = false,
  active = true
where token_amount = 10200;

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '66 BC Coins', 66, 9.99, 0, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 66 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '166 BC Coins', 166, 24.99, 20, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 166 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '666 BC Coins', 666, 99.99, 150, true, true
where not exists (
  select 1 from public.token_packages where token_amount = 666 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '1200 BC Coins', 1200, 180.00, 450, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 1200 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '2560 BC Coins', 2560, 384.00, 700, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 2560 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '5200 BC Coins', 5200, 780.00, 1500, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 5200 and active = true
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
select '10200 BC Coins', 10200, 1530.00, 3133, false, true
where not exists (
  select 1 from public.token_packages where token_amount = 10200 and active = true
);
