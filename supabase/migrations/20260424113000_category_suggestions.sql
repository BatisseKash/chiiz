create table if not exists public.category_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  category_name text not null,
  category_type text not null check (category_type in ('income', 'expense')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_category_suggestions_default_unique
on public.category_suggestions(category_type, lower(category_name))
where user_id is null;

create unique index if not exists idx_category_suggestions_user_unique
on public.category_suggestions(user_id, category_type, lower(category_name))
where user_id is not null;

create index if not exists idx_category_suggestions_user_type
on public.category_suggestions(user_id, category_type);

create index if not exists idx_category_suggestions_type_default
on public.category_suggestions(category_type, is_default);

insert into public.category_suggestions (user_id, category_name, category_type, is_default)
values
  (null, 'Housing', 'expense', true),
  (null, 'Utilities', 'expense', true),
  (null, 'Groceries', 'expense', true),
  (null, 'Dining & Drinks', 'expense', true),
  (null, 'Transportation', 'expense', true),
  (null, 'Travel', 'expense', true),
  (null, 'Shopping', 'expense', true),
  (null, 'Health', 'expense', true),
  (null, 'Fitness', 'expense', true),
  (null, 'Kids & Family', 'expense', true),
  (null, 'Entertainment', 'expense', true),
  (null, 'Subscriptions', 'expense', true),
  (null, 'Debt & Financial', 'expense', true),
  (null, 'Gifts & Donations', 'expense', true),
  (null, 'Pets', 'expense', true),
  (null, 'Personal Care', 'expense', true),
  (null, 'Education', 'expense', true),
  (null, 'Miscellaneous', 'expense', true)
on conflict do nothing;
