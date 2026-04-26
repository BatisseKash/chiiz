import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Category } from '../../types';
import { Card } from '../Card';

const CHIIZ_CHART_COLORS = [
  '#2DCC8F',
  '#667EEA',
  '#F5A623',
  '#F0635A',
  '#63B3ED',
  '#B794F4',
  '#68D391',
];

type CategoryPieChartProps = {
  categories: Category[];
};

export function CategoryPieChart({ categories }: CategoryPieChartProps) {
  return (
    <Card className="p-5">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
          Breakdown
        </p>
        <h2 className="mt-1.5 font-display text-xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Category distribution
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          How this period is split across your active budget categories.
        </p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categories}
              dataKey="actual"
              nameKey="name"
              innerRadius={68}
              outerRadius={108}
              paddingAngle={3}
            >
              {categories.map((category, index) => (
                <Cell key={category.id} fill={CHIIZ_CHART_COLORS[index % CHIIZ_CHART_COLORS.length]} />
              ))}
            </Pie>
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
                return [`$${normalized.toLocaleString()}`, 'Actual spend'];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
