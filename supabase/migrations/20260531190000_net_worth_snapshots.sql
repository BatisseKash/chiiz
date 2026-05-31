alter table public.accounts
add column if not exists plaid_type text;

alter table public.accounts
add column if not exists account_subtype text;

alter table public.accounts
add column if not exists net_worth_type text;

alter table public.accounts
add column if not exists current_balance numeric(14, 2);

alter table public.accounts
add column if not exists institution_name text;

alter table public.accounts
add column if not exists mask text;

alter table public.accounts
add column if not exists last_synced_at timestamptz;

alter table public.accounts
drop constraint if exists accounts_net_worth_type_check;

alter table public.accounts
add constraint accounts_net_worth_type_check
check (
  net_worth_type is null
  or net_worth_type in ('asset', 'liability')
);

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  total_assets numeric(14, 2) not null default 0,
  total_liabilities numeric(14, 2) not null default 0,
  net_worth numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_net_worth_snapshots_user_date
on public.net_worth_snapshots(user_id, snapshot_date desc, created_at desc);
