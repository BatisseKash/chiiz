create table if not exists public.account_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  snapshot_date date not null default current_date,
  account_balance numeric(14, 2) not null,
  net_worth_type text not null,
  plaid_type text,
  account_subtype text,
  account_name text,
  institution_name text,
  mask text,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  constraint account_history_net_worth_type_check
  check (net_worth_type in ('asset', 'liability'))
);

create index if not exists idx_account_history_user_date
on public.account_history(user_id, snapshot_date desc, created_at desc);

create index if not exists idx_account_history_account_date
on public.account_history(account_id, snapshot_date desc, created_at desc);

create index if not exists idx_account_history_user_account_date
on public.account_history(user_id, account_id, snapshot_date desc, created_at desc);
