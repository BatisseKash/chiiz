alter table public.category_sets
add column if not exists status text not null default 'active';

alter table public.category_sets
drop constraint if exists category_sets_status_check;

alter table public.category_sets
add constraint category_sets_status_check
check (status in ('active', 'archived'));

update public.category_sets
set status = 'active'
where status is null;

create index if not exists idx_category_sets_user_status
on public.category_sets(user_id, status);
