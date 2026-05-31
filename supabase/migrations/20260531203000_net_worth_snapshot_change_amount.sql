alter table public.net_worth_snapshots
add column if not exists change_amount numeric(14, 2);
