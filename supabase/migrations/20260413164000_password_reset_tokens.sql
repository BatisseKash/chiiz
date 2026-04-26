create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user_id
on public.password_reset_tokens(user_id);

create index if not exists idx_password_reset_tokens_expires_at
on public.password_reset_tokens(expires_at);
