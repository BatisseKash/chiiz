import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Category } from '../../types';
import { Card } from '../Card';

type PerformanceBarChartProps = {
  categories: Category[];
};

export function PerformanceBarChart({ categories }: PerformanceBarChartProps) {
  return (
    <Card className="p-5">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
          Performance
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Budget vs actual spend
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Compare what you planned against actual spending by category.
        </p>
      </div>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categories} barGap={6}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="4 4" strokeOpacity={0.5} />
            <XAxis
              dataKey="name"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: '10px',
                color: 'var(--color-text-primary)',
                boxShadow: 'var(--shadow-md)',
                fontSize: '13px',
                fontFamily: 'var(--font-body)',
              }}
              labelStyle={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}
              formatter={(value) => {
                const normalized = Array.isArray(value) ? Number(value[0] || 0) : Number(value || 0);
                return `$${normalized.toLocaleString()}`;
              }}
            />
            <Legend
              wrapperStyle={{
                color: 'var(--color-text-secondary)',
                fontSize: '12px',
                fontFamily: 'var(--font-body)',
                paddingTop: '12px',
              }}
            />
            <Bar dataKey="budget" name="Budgeted" fill="var(--color-accent-light)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="actual"  name="Actual"   fill="var(--color-accent)"       radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
