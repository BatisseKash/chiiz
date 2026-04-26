import { Building2, CreditCard, Link2 } from 'lucide-react';
import type { LinkedPlaidItem } from '../types';
import { Button } from './Button';

type PlaidConnectionCardProps = {
  accountCount: number | null;
  linkedItems: LinkedPlaidItem[];
  loading: boolean;
  onConnect: () => void;
};

type AccountRow = {
  id: string;
  institution: string;
  accountName: string;
  accountType: string;
  status: 'Connected' | 'Needs Attention';
};

function statusFromItemStatus(status: LinkedPlaidItem['status']): AccountRow['status'] {
  return status === 'healthy' || status === 'pending_initial_sync' ? 'Connected' : 'Needs Attention';
}

function accountTypeLabel(rawType: string | null) {
  const normalized = String(rawType || '').toLowerCase();
  if (!normalized) {
    return 'Account';
  }
  if (normalized.includes('credit')) {
    return 'Credit Card';
  }
  if (normalized.includes('checking')) {
    return 'Checking';
  }
  if (normalized.includes('savings')) {
    return 'Savings';
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function PlaidConnectionCard({
  accountCount,
  linkedItems,
  loading,
  onConnect,
}: PlaidConnectionCardProps) {
  const rows: AccountRow[] = linkedItems.flatMap((item) =>
    item.accounts.map((account) => ({
      id: account.id,
      institution: item.institution_name || 'Linked institution',
      accountName: account.account_name || 'Unnamed account',
      accountType: accountTypeLabel(account.account_type),
      status: statusFromItemStatus(item.status),
    })),
  );

  const total = accountCount ?? rows.length;
  const creditCards = rows.filter((row) => row.accountType === 'Credit Card').length;
  const bankAccounts = Math.max(0, total - creditCards);

  return (
    <section className="max-w-[980px] overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <header className="flex flex-col items-start justify-between gap-4 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:flex-wrap sm:px-5">
        <div className="max-w-[560px]">
          <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[2rem]">
            Linked Accounts
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Connect financial accounts through Plaid, view how many are linked, and manage your synced account list in one place.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={onConnect}
          disabled={loading}
          className="w-full justify-center px-4 py-2 text-xs font-semibold sm:w-auto"
        >
          <Link2 className="h-4 w-4" strokeWidth={1.7} />
          {loading ? 'Linking...' : 'Link Account'}
        </Button>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <article className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            Total Accounts Linked
          </p>
          <p className="mt-1 font-display text-[2.5rem] font-bold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-[3rem]">
            {total}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {bankAccounts} bank account{bankAccounts === 1 ? '' : 's'} and {creditCards} credit card{creditCards === 1 ? '' : 's'} currently synced
          </p>
        </article>

        <div className="overflow-x-auto rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="min-w-[680px]">
          <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-3 border-b border-[var(--color-border)] bg-[#FBFAF8] px-4 py-3">
            {['Account', 'Institution', 'Type', 'Status'].map((head) => (
              <p key={head} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                {head}
              </p>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">No accounts linked yet.</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Use “Link Account” to connect your first bank or card.
              </p>
            </div>
          ) : (
            rows.map((row) => {
              const isCredit = row.accountType === 'Credit Card';
              const Icon = isCredit ? CreditCard : Building2;
              return (
                <div key={row.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]">
                      <Icon className="h-4 w-4" strokeWidth={1.6} />
                    </span>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{row.accountName}</p>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{row.institution}</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{row.accountType}</p>
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.05em] ${
                        row.status === 'Connected'
                          ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
                          : 'bg-[#FDE9E7] text-[var(--color-negative)]'
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>
    </section>
  );
}
