import { formatCurrency } from '../lib/format';
import type { Category } from '../types';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';

type BudgetPerformanceTableProps = {
  categories: Category[];
};

export function BudgetPerformanceTable({ categories }: BudgetPerformanceTableProps) {
  const totalBudget = categories.reduce((sum, category) => sum + category.budget, 0);
  const totalActual = categories.reduce((sum, category) => sum + category.actual, 0);
  const totalDifference = totalBudget - totalActual;

  return (
    <Card className="space-y-5">
      <SectionHeader
        eyebrow="Reconciliation"
        title="Budget vs actual"
        description="Forecast, outcome, and gap per category."
      />

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead className="bg-[var(--color-surface-alt)]">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">Category</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">Budget</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">Actual</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)] text-sm">
              {categories.map((category) => {
                const difference = category.budget - category.actual;
                const pct = category.budget > 0 ? category.actual / category.budget : 0;
                const status = pct >= 1 ? 'over' : pct >= 0.8 ? 'warning' : 'safe';
                const barColor =
                  status === 'over'
                    ? 'var(--color-negative)'
                    : status === 'warning'
                      ? 'var(--color-warning)'
                      : 'var(--color-positive)';

                return (
                  <tr key={category.id} className="transition-colors hover:bg-[var(--color-surface-alt)]">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">{category.name}</p>
                        <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct * 100, 100)}%`, background: barColor }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{formatCurrency(category.budget)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{formatCurrency(category.actual)}</td>
                    <td className={`px-4 py-3 font-semibold ${difference >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                      {difference >= 0 ? '+' : '–'}{formatCurrency(Math.abs(difference))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-sm">
              <tr>
                <td className="px-4 py-3 text-xs font-bold uppercase tracking-[0.05em] text-[var(--color-text-primary)]">Total</td>
                <td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">{formatCurrency(totalBudget)}</td>
                <td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">{formatCurrency(totalActual)}</td>
                <td className={`px-4 py-3 font-bold ${totalDifference >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {totalDifference >= 0 ? '+' : '–'}{formatCurrency(Math.abs(totalDifference))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Card>
  );
}
