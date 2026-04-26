import { PiggyBank, Receipt, Target, Wallet } from 'lucide-react';

type SummaryCardProps = {
  label: string;
  value: string;
  change: string;
};

const iconByLabel = {
  'Income':                 Wallet,
  'Expenses':               Receipt,
  'Net Savings':            PiggyBank,
  'Remaining vs Budget':    Target,
  'Monthly Income':         Wallet,
  'Monthly Expenses':       Receipt,
  'Savings Amount':         PiggyBank,
  'Remaining Per Budget':   Target,
} as const;

export function SummaryCard({ label, value, change }: SummaryCardProps) {
  const Icon = iconByLabel[label as keyof typeof iconByLabel] || Wallet;

  return (
    <div className="animate-enter rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:-translate-y-px">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            {label}
          </p>
          <p className="animate-number mt-2 font-display text-[2rem] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">{change}</p>
        </div>
        <div className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] p-2.5 text-[var(--color-accent-dark)]">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
