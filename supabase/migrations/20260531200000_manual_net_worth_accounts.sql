alter table public.accounts
add column if not exists is_manual boolean not null default false;

alter table public.accounts
alter column plaid_item_id drop not null;

alter table public.accounts
alter column plaid_account_id drop not null;

alter table public.accounts
drop constraint if exists accounts_plaid_account_id_key;

create index if not exists idx_accounts_user_manual
on public.accounts(user_id, is_manual);
