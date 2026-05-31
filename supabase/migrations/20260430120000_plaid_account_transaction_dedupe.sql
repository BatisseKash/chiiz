alter table public.transactions
add column if not exists transaction_dedupe_key text;

alter table public.transactions
add column if not exists plaid_pending boolean not null default false;

update public.transactions
set transaction_dedupe_key = case
  when plaid_transaction_id is not null and plaid_transaction_id <> ''
    then 'plaid:' || user_id::text || ':' || plaid_transaction_id
  else 'fallback:' || md5(
    coalesce(account_id::text, '') || '|' ||
    coalesce(date::text, '') || '|' ||
    coalesce(amount::text, '') || '|' ||
    lower(coalesce(merchant_name, transaction_name, '')) || '|' ||
    case when plaid_pending then 'pending' else 'posted' end
  )
end
where transaction_dedupe_key is null;

do $$
begin
  if not exists (
    select 1
    from public.accounts
    where plaid_account_id is not null and plaid_account_id <> ''
    group by user_id, plaid_account_id
    having count(*) > 1
  ) then
    create unique index if not exists idx_accounts_user_plaid_account_unique
    on public.accounts(user_id, plaid_account_id)
    where plaid_account_id is not null and plaid_account_id <> '';
  else
    raise notice 'Skipped idx_accounts_user_plaid_account_unique because duplicate account rows already exist.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from public.transactions
    where plaid_transaction_id is not null and plaid_transaction_id <> ''
    group by user_id, plaid_transaction_id
    having count(*) > 1
  ) then
    create unique index if not exists idx_transactions_user_plaid_transaction_unique
    on public.transactions(user_id, plaid_transaction_id)
    where plaid_transaction_id is not null and plaid_transaction_id <> '';
  else
    raise notice 'Skipped idx_transactions_user_plaid_transaction_unique because duplicate transaction rows already exist.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from public.transactions
    where transaction_dedupe_key is not null and transaction_dedupe_key <> ''
    group by user_id, transaction_dedupe_key
    having count(*) > 1
  ) then
    create unique index if not exists idx_transactions_user_dedupe_key_unique
    on public.transactions(user_id, transaction_dedupe_key)
    where transaction_dedupe_key is not null and transaction_dedupe_key <> '';
  else
    raise notice 'Skipped idx_transactions_user_dedupe_key_unique because duplicate transaction dedupe keys already exist.';
  end if;
end
$$;
