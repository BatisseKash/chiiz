create table if not exists public.category_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_category_sets_user_default_unique
on public.category_sets(user_id)
where is_default = true;

create index if not exists idx_category_sets_user_id
on public.category_sets(user_id);

alter table public.categories
add column if not exists category_set_id uuid references public.category_sets(id) on delete cascade;

create index if not exists idx_categories_category_set_id
on public.categories(category_set_id);

drop index if exists idx_categories_user_name_status_unique;

create unique index if not exists idx_categories_user_set_name_status_unique
on public.categories(user_id, category_set_id, lower(category_name), status)
where status in ('suggested', 'active');

insert into public.category_sets (user_id, name, is_default)
select distinct c.user_id, 'Default Budget', true
from public.categories c
where c.user_id is not null
  and not exists (
    select 1
    from public.category_sets cs
    where cs.user_id = c.user_id
  );

update public.categories c
set category_set_id = cs.id
from public.category_sets cs
where c.user_id = cs.user_id
  and cs.is_default = true
  and c.category_set_id is null;

create table if not exists public.category_set_month_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_set_id uuid not null references public.category_sets(id) on delete cascade,
  month_key date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_set_month_assignments_month_start_check
    check (date_part('day', month_key) = 1)
);

create unique index if not exists idx_category_set_month_assignments_user_month_unique
on public.category_set_month_assignments(user_id, month_key);

create index if not exists idx_category_set_month_assignments_set_id
on public.category_set_month_assignments(category_set_id);
