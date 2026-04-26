create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plaid_item_id text not null unique,
  access_token_encrypted text not null,
  institution_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plaid_item_id uuid not null references public.plaid_items(id) on delete cascade,
  plaid_account_id text not null unique,
  account_name text,
  account_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_name text not null,
  category_type text not null check (category_type in ('income', 'expense')),
  forecasted_amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  plaid_transaction_id text not null unique,
  institution_name text,
  merchant_name text,
  date date not null,
  amount numeric(12, 2) not null,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plaid_items_user_id on public.plaid_items(user_id);
create index if not exists idx_accounts_user_id on public.accounts(user_id);
create index if not exists idx_accounts_plaid_item_id on public.accounts(plaid_item_id);
create index if not exists idx_categories_user_id on public.categories(user_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_account_id on public.transactions(account_id);
create index if not exists idx_transactions_category_id on public.transactions(category_id);
