import { Sparkles } from 'lucide-react';
import { monthlyIncome } from '../data/mockData';
import { formatCompactCurrency, formatCurrency, formatPercent } from '../lib/format';
import type { Category } from '../types';
import { Card } from './Card';

type DashboardHeroProps = {
  categories: Category[];
};

function MetricPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/70 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/65">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-950">{value}</p>
      <p className="mt-2 text-sm text-emerald-900/70">{hint}</p>
    </div>
  );
}

export function DashboardHero({ categories }: DashboardHeroProps) {
  const totalActual = categories.reduce((sum, category) => sum + category.actual, 0);
  const totalBudget = categories.reduce((sum, category) => sum + category.budget, 0);
  const savingsRate = (monthlyIncome - totalActual) / monthlyIncome;
  const topCategory = [...categories].sort((left, right) => right.actual - left.actual)[0];
  const budgetHealth = totalBudget === 0 ? 0 : (totalBudget - totalActual) / totalBudget;

  return (
    <Card variant="elevated" className="space-y-8">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-medium uppercase tracking-[0.24em] text-emerald-900/70">
          <Sparkles className="h-3.5 w-3.5" />
          Monthly overview
        </div>
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight text-emerald-950 md:text-[2.6rem] md:leading-[1.08]">
            A clean view of your budget, without the noise.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-900/70 md:text-[15px]">
            Focus on the essential signals: what you planned, what you spent, and where your month
            is heading.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricPill
          label="Net flow"
          value={formatCompactCurrency(monthlyIncome - totalActual)}
          hint={`${formatPercent(Math.max(savingsRate, 0))} saved so far`}
        />
        <MetricPill
          label="Budget health"
          value={formatPercent(Math.max(budgetHealth, -1))}
          hint={budgetHealth >= 0 ? 'Below plan' : 'Over plan'}
        />
        <MetricPill
          label="Top category"
          value={topCategory?.name || 'N/A'}
          hint={topCategory ? `${formatCurrency(topCategory.actual)} spent` : 'No activity yet'}
        />
        <MetricPill
          label="Planned spend"
          value={formatCompactCurrency(totalBudget)}
          hint="Total category budgets this month"
        />
      </div>
    </Card>
  );
}
