alter table public.transactions
add column if not exists ignored_from_budget boolean not null default false;

create index if not exists idx_transactions_user_ignored_from_budget
on public.transactions(user_id, ignored_from_budget);
