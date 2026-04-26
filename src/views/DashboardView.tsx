import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { DashboardFilters } from '../components/DashboardFilters';
import { formatCurrency } from '../lib/format';
import type { Category, PlaidTransaction, SummaryMetric } from '../types';

type DashboardViewProps = {
  summary: SummaryMetric[];
  categories: Category[];
  transactions: PlaidTransaction[];
  filterProps: ComponentProps<typeof DashboardFilters>;
  onOpenTransactions: () => void;
  onOpenPerformanceCategoryAnalysis: () => void;
};

const CHART_COLORS = ['#2DCC8F', '#667EEA', '#F5A623', '#F0635A', '#63B3ED', '#8B7EF0', '#22C55E'];

function metricTone(label: string) {
  if (label.toLowerCase().includes('income') || label.toLowerCase().includes('savings')) {
    return 'text-[var(--color-positive)]';
  }
  if (label.toLowerCase().includes('spending')) {
    return 'text-[var(--color-text-primary)]';
  }
  return 'text-[var(--color-text-primary)]';
}

function transactionDisplayName(transaction: PlaidTransaction) {
  return transaction.name || transaction.merchant_name || 'Unknown merchant';
}

function transactionAccountLabel(transaction: PlaidTransaction) {
  const institution = transaction.institution_name || 'Institution';
  const account = transaction.account_name || 'Account';
  return `${institution} · ${account}`;
}

function transactionCategoryLabel(transaction: PlaidTransaction) {
  return transaction.category_name || 'Uncategorized';
}

function transactionInitial(transaction: PlaidTransaction) {
  const label = transactionDisplayName(transaction).trim();
  if (!label) {
    return '?';
  }
  return label[0].toUpperCase();
}

export function DashboardView({
  summary,
  categories,
  transactions,
  filterProps,
  onOpenTransactions,
  onOpenPerformanceCategoryAnalysis,
}: DashboardViewProps) {
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.categoryType !== 'income' && category.actual > 0),
    [categories],
  );
  const spendingBreakdownCategories = useMemo(
    () => [...expenseCategories].sort((a, b) => b.actual - a.actual),
    [expenseCategories],
  );

  const topSpending = useMemo(
    () => spendingBreakdownCategories.slice(0, 3),
    [spendingBreakdownCategories],
  );

  const alerts = useMemo(
    () =>
      expenseCategories
        .filter((category) => category.budget > 0 && category.actual > category.budget)
        .sort((a, b) => b.actual - b.budget - (a.actual - a.budget))
        .slice(0, 3),
    [expenseCategories],
  );

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 6),
    [transactions],
  );

  const totalSpending = expenseCategories.reduce((sum, category) => sum + category.actual, 0);

  return (
    <div className="space-y-4">
      <DashboardFilters {...filterProps} />

      <section className="kstrip overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((item, index) => {
              return (
                <article
                  key={item.label}
                  className={`p-4 sm:p-5 xl:p-6 ${
                    index > 0
                      ? 'border-t border-[var(--color-border)] sm:border-l sm:border-t-0 xl:border-l'
                      : ''
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 font-display text-[2.3rem] font-bold tracking-[-0.04em] sm:text-[2.8rem] xl:text-[3.2rem] ${metricTone(item.label)}`}
                  >
                    {item.value}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      item.change.includes('Negative') || item.change.includes('Over')
                        ? 'text-[var(--color-negative)]'
                        : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {item.change}
                  </p>
                </article>
              );
            })}
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex flex-col items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:px-5">
              <div>
                <p className="font-display text-[1.6rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-[1.9rem]">
                  Spending Breakdown
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">Where your money went in the selected period</p>
              </div>
              <button
                type="button"
                onClick={onOpenPerformanceCategoryAnalysis}
                className="text-sm font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-dark)]"
              >
                View all →
              </button>
            </div>

            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-[230px_minmax(0,1fr)]">
              <div className="relative h-32 w-full sm:h-44 md:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={spendingBreakdownCategories}
                      dataKey="actual"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={58}
                      stroke="none"
                      paddingAngle={2}
                    >
                      {spendingBreakdownCategories.map((category, index) => (
                        <Cell
                          key={category.id}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="font-display text-[1rem] font-bold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-2xl md:text-3xl">
                      {formatCurrency(totalSpending)}
                    </p>
                    <p className="-mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] sm:text-[11px]">
                      Total
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {spendingBreakdownCategories.map((category, index) => (
                  <div key={category.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-[3px]"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)] sm:text-[1rem]">{category.name}</p>
                    </div>
                    <p className="text-[13px] font-semibold text-[var(--color-text-primary)] sm:text-[1rem]">
                      {formatCurrency(category.actual)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenPerformanceCategoryAnalysis}
              className="w-full border-t border-[var(--color-border)] px-5 py-3 text-left text-sm font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-dark)]"
            >
              View all categories →
            </button>
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex flex-col items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:px-5">
              <div>
                <p className="font-display text-[1.6rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-[1.9rem]">
                  Recent Transactions
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">AI-categorized</p>
              </div>
              <button
                type="button"
                onClick={onOpenTransactions}
                className="text-sm font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-dark)]"
              >
                See all →
              </button>
            </div>

            <div className="md:hidden">
              <div className="divide-y divide-[var(--color-border)]">
                {recentTransactions.map((transaction) => {
                  const amount = Number(transaction.amount || 0);
                  const isIncome = amount < 0;
                  const categoryLabel = transactionCategoryLabel(transaction);
                  const isUncategorized = !transaction.category_name;
                  return (
                    <div key={transaction.transaction_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-sm font-semibold text-[var(--color-accent-dark)]">
                        {transactionInitial(transaction)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                          {transactionDisplayName(transaction)}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                          {transaction.date} · {transactionAccountLabel(transaction)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-bold ${
                            isIncome ? 'text-[var(--color-positive)]' : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrency(Math.abs(amount))}
                        </p>
                        <span
                          className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${
                            isUncategorized
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
                          }`}
                        >
                          {categoryLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {recentTransactions.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                    No transactions for the selected period.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[700px]">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Date</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Description</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Category</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Account</th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((transaction) => {
                    const amount = Number(transaction.amount || 0);
                    return (
                      <tr
                        key={transaction.transaction_id}
                        className="border-b border-[var(--color-border)] transition hover:bg-[var(--color-surface-alt)]"
                      >
                        <td className="px-5 py-3 text-sm text-[var(--color-text-muted)]">{transaction.date}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                          {transactionDisplayName(transaction)}
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--color-text-secondary)]">
                          {transaction.category_name || (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              Uncategorized
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--color-text-secondary)]">
                          {transactionAccountLabel(transaction)}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                          {amount < 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(amount))}
                        </td>
                      </tr>
                    );
                  })}
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]"
                      >
                        No transactions for the selected period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
              <p className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-[1.7rem]">
                Top Spending Categories
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">Where your money went in the selected period</p>
            </div>
            <div className="space-y-1 px-5 py-3">
              {topSpending.map((category, index) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between border-b border-[var(--color-border)] py-2.5 last:border-b-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[11px] font-semibold text-[var(--color-text-muted)]">
                      {index + 1}
                    </span>
                    <p className="text-[1rem] font-semibold text-[var(--color-text-primary)]">{category.name}</p>
                  </div>
                  <p className="text-[1rem] font-semibold text-[var(--color-text-primary)]">
                    {formatCurrency(category.actual)}
                  </p>
                </div>
              ))}
              {topSpending.length === 0 ? (
                <p className="py-3 text-sm text-[var(--color-text-muted)]">No spend yet for this period.</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onOpenPerformanceCategoryAnalysis}
              className="w-full border-t border-[var(--color-border)] px-5 py-3 text-left text-sm font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-dark)]"
            >
              View all categories →
            </button>
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
              <p className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-[1.7rem]">
                Alerts & Insights
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">Keep an eye on your budget</p>
            </div>
            <div className="space-y-3 p-4">
              {alerts.map((category, index) => {
                const pct = Math.min(100, Math.round((category.actual / Math.max(category.budget, 1)) * 100));
                const isWarning = index > 0;
                return (
                  <article
                    key={category.id}
                    className="rounded-[10px] bg-[var(--color-surface-alt)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                            isWarning ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-negative)]'
                          }`}
                        >
                          !
                        </span>
                        <p className="text-[1rem] font-semibold text-[var(--color-text-primary)]">{category.name}</p>
                      </div>
                      <p
                        className={`text-[1rem] font-bold ${
                          isWarning ? 'text-[var(--color-warning)]' : 'text-[var(--color-negative)]'
                        }`}
                      >
                        {formatCurrency(category.actual)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {formatCurrency(category.actual)} spent of <strong>{formatCurrency(category.budget)}</strong> budgeted
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                      <div
                        className={isWarning ? 'h-full bg-[var(--color-warning)]' : 'h-full bg-[var(--color-negative)]'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </article>
                );
              })}
              {alerts.length === 0 ? (
                <div className="rounded-[10px] bg-[var(--color-accent-light)] p-3">
                  <p className="text-sm font-semibold text-[var(--color-accent-dark)]">Chiiz AI</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Nice work. You are currently tracking within your category budgets.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
