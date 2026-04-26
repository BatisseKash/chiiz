create table if not exists public.historical_category_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month_key date not null,
  amount numeric not null,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_category_amounts_month_start_check
    check (date_part('day', month_key) = 1),
  constraint historical_category_amounts_source_check
    check (source in ('upload'))
);

create unique index if not exists idx_historical_category_amounts_unique_source
on public.historical_category_amounts(user_id, category_id, month_key, source);

create index if not exists idx_historical_category_amounts_user_month
on public.historical_category_amounts(user_id, month_key);
