alter table public.categories
add column if not exists description text;

alter table public.categories
add column if not exists source text not null default 'user';

alter table public.categories
add column if not exists status text not null default 'active';

alter table public.categories
add column if not exists suggestion_rationale text;

alter table public.categories
add column if not exists accepted_at timestamptz;

alter table public.categories
drop constraint if exists categories_source_check;

alter table public.categories
add constraint categories_source_check
check (source in ('user', 'ai'));

alter table public.categories
drop constraint if exists categories_status_check;

alter table public.categories
add constraint categories_status_check
check (status in ('suggested', 'active', 'archived'));

create index if not exists idx_categories_user_status
on public.categories(user_id, status);

create unique index if not exists idx_categories_user_name_status_unique
on public.categories(user_id, lower(category_name), status)
where status in ('suggested', 'active');
