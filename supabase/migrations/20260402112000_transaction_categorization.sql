alter table public.transactions
add column if not exists transaction_name text;

alter table public.transactions
add column if not exists normalized_merchant_name text;

alter table public.transactions
add column if not exists plaid_category_primary text;

alter table public.transactions
add column if not exists plaid_category_detailed text;

alter table public.transactions
add column if not exists categorization_source text;

alter table public.transactions
add column if not exists categorization_confidence numeric(4, 3);

alter table public.transactions
add column if not exists categorization_reason text;

alter table public.transactions
add column if not exists categorized_at timestamptz;

alter table public.transactions
drop constraint if exists transactions_categorization_source_check;

alter table public.transactions
add constraint transactions_categorization_source_check
check (
  categorization_source is null
  or categorization_source in ('ai', 'rule', 'mapped', 'user', 'needs_review')
);

create index if not exists idx_transactions_user_category
on public.transactions(user_id, category_id);

create index if not exists idx_transactions_user_normalized_merchant
on public.transactions(user_id, normalized_merchant_name);

create table if not exists public.merchant_category_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  normalized_merchant_name text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  source text not null default 'ai',
  usage_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_category_mappings
drop constraint if exists merchant_category_mappings_source_check;

alter table public.merchant_category_mappings
add constraint merchant_category_mappings_source_check
check (source in ('ai', 'rule', 'user', 'mapped'));

create unique index if not exists idx_merchant_category_mappings_user_merchant_unique
on public.merchant_category_mappings(user_id, normalized_merchant_name);

create index if not exists idx_merchant_category_mappings_category_id
on public.merchant_category_mappings(category_id);
