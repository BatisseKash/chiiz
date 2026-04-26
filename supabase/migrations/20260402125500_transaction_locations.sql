alter table public.transactions
add column if not exists location_city text;

alter table public.transactions
add column if not exists location_region text;
