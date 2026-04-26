import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '../lib/format';
import {
  GAMBLING_EXPENSE_CATEGORY_NAME,
  GAMBLING_WINNINGS_CATEGORY_NAME,
  getMonthlyGamblingNetAmounts,
  isGamblingExpenseCategoryName,
  isGamblingWinningsCategoryName,
} from '../lib/gamblingNetting';
import type { Category, PlaidTransaction } from '../types';

type PerformanceViewProps = {
  categories: Category[];
  transactions: PlaidTransaction[];
  focusCategoryAnalysisNonce?: number;
};

type Metric = 'spending' | 'income' | 'savings';

const dotPalette = ['#2DCC8F', '#667EEA', '#F5A623', '#F0635A', '#63B3ED', '#B794F4', '#A0AEC0'];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseLocalDate(value: string) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function monthKeyFromDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatCurrencyCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `$${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1000) {
    return `$${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function shortLabelFromMonthKey(key: string, shortMonth: string) {
  const yearShort = key.slice(2, 4);
  return `${shortMonth} ${yearShort}`;
}

function getChartSizing(monthCount: number) {
  if (monthCount <= 2) {
    return {
      chartHeight: 360,
      barWidth: 44,
      labelFontSize: 16,
      labelOffset: 14,
      xAxisFontSize: 13,
      pairGap: 10,
      groupGap: 28,
    };
  }
  if (monthCount <= 4) {
    return {
      chartHeight: 340,
      barWidth: 30,
      labelFontSize: 15,
      labelOffset: 12,
      xAxisFontSize: 13,
      pairGap: 8,
      groupGap: 22,
    };
  }
  if (monthCount <= 6) {
    return {
      chartHeight: 320,
      barWidth: 22,
      labelFontSize: 14,
      labelOffset: 11,
      xAxisFontSize: 12,
      pairGap: 7,
      groupGap: 16,
    };
  }
  if (monthCount <= 9) {
    return {
      chartHeight: 300,
      barWidth: 18,
      labelFontSize: 13,
      labelOffset: 10,
      xAxisFontSize: 12,
      pairGap: 6,
      groupGap: 10,
    };
  }
  return {
    chartHeight: 280,
    barWidth: 14,
    labelFontSize: 12,
    labelOffset: 8,
    xAxisFontSize: 11,
    pairGap: 5,
    groupGap: 8,
  };
}

export function PerformanceView({
  categories,
  transactions,
  focusCategoryAnalysisNonce = 0,
}: PerformanceViewProps) {
  const [metric, setMetric] = useState<Metric>('spending');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerQuery, setExplorerQuery] = useState('');
  const [selectedExplorerMonthKeys, setSelectedExplorerMonthKeys] = useState<string[]>([]);
  const [draftExplorerMonthKeys, setDraftExplorerMonthKeys] = useState<string[]>([]);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const chartRailRef = useRef<HTMLDivElement | null>(null);
  const categoryAnalysisSectionRef = useRef<HTMLElement | null>(null);
  const chartSyncingRef = useRef(false);

  const longMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }),
    [],
  );
  const shortMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'short' }),
    [],
  );

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.categoryType === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((category) => category.categoryType === 'income'),
    [categories],
  );

  const monthlyComputed = useMemo(() => {
    const categoryTypeById = new Map<string, 'income' | 'expense'>();
    const categoryNameById = new Map<string, string>();
    for (const category of categories) {
      categoryTypeById.set(category.id, category.categoryType);
      categoryNameById.set(category.id, category.name);
    }

    type CategoryAggregate = {
      id: string;
      name: string;
      type: 'income' | 'expense';
      actual: number;
    };

    type MonthAggregate = {
      incomeActual: number;
      spendingActual: number;
      gamblingExpenseTotal: number;
      gamblingWinningsTotal: number;
      gamblingExpenseCategoryKey: string | null;
      gamblingWinningsCategoryKey: string | null;
      categories: Map<string, CategoryAggregate>;
    };

    const byMonth = new Map<string, MonthAggregate>();

    const ensureMonth = (monthKey: string) => {
      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, {
          incomeActual: 0,
          spendingActual: 0,
          gamblingExpenseTotal: 0,
          gamblingWinningsTotal: 0,
          gamblingExpenseCategoryKey: null,
          gamblingWinningsCategoryKey: null,
          categories: new Map(),
        });
      }
      return byMonth.get(monthKey)!;
    };

    const ensureCategory = (
      month: MonthAggregate,
      key: string,
      id: string,
      name: string,
      type: 'income' | 'expense',
    ) => {
      if (!month.categories.has(key)) {
        month.categories.set(key, {
          id,
          name,
          type,
          actual: 0,
        });
      }
      return month.categories.get(key)!;
    };

    for (const transaction of transactions) {
      if (transaction.ignored_from_budget) {
        continue;
      }

      const monthKey = monthKeyFromDate(transaction.date);
      if (!monthKey) {
        continue;
      }
      const month = ensureMonth(monthKey);

      const amount = Number(transaction.amount || 0);
      const categoryId = String(transaction.category_id || '').trim();
      const fallbackCategoryName = categoryId ? categoryNameById.get(categoryId) || '' : '';
      const categoryName = String(transaction.category_name || fallbackCategoryName || '').trim();

      const resolvedType =
        transaction.category_type ||
        (categoryId ? categoryTypeById.get(categoryId) || null : null) ||
        (amount < 0 ? 'income' : 'expense');
      const categoryType: 'income' | 'expense' = resolvedType === 'income' ? 'income' : 'expense';

      const key = categoryId || `${categoryType}|${categoryName.toLowerCase()}`;
      const rowId = categoryId || key;
      const rowName = categoryName || 'Uncategorized';

      if (isGamblingExpenseCategoryName(rowName) && amount > 0) {
        month.gamblingExpenseTotal += amount;
        month.gamblingExpenseCategoryKey = key;
        ensureCategory(month, key, rowId, rowName, 'expense');
        continue;
      }

      if (isGamblingWinningsCategoryName(rowName) && amount < 0) {
        month.gamblingWinningsTotal += Math.abs(amount);
        month.gamblingWinningsCategoryKey = key;
        ensureCategory(month, key, rowId, rowName, 'income');
        continue;
      }

      if (categoryType === 'income') {
        const normalized = Math.abs(amount);
        month.incomeActual += normalized;
        if (categoryId || categoryName) {
          const category = ensureCategory(month, key, rowId, rowName, 'income');
          category.actual += normalized;
        }
        continue;
      }

      if (categoryType === 'expense') {
        const normalized = amount > 0 ? amount : amount < 0 ? -Math.abs(amount) : 0;
        month.spendingActual += normalized;
        if (categoryId || categoryName) {
          const category = ensureCategory(month, key, rowId, rowName, 'expense');
          category.actual += normalized;
        }
      }
    }

    for (const month of byMonth.values()) {
      const net = getMonthlyGamblingNetAmounts(month.gamblingExpenseTotal, month.gamblingWinningsTotal);
      if (net.expenseDisplayAmount > 0) {
        month.spendingActual += net.expenseDisplayAmount;
        const key = month.gamblingExpenseCategoryKey || `expense|${GAMBLING_EXPENSE_CATEGORY_NAME.toLowerCase()}`;
        const category = ensureCategory(
          month,
          key,
          month.gamblingExpenseCategoryKey || key,
          GAMBLING_EXPENSE_CATEGORY_NAME,
          'expense',
        );
        category.actual += net.expenseDisplayAmount;
      }
      if (net.winningsDisplayAmount > 0) {
        month.incomeActual += net.winningsDisplayAmount;
        const key = month.gamblingWinningsCategoryKey || `income|${GAMBLING_WINNINGS_CATEGORY_NAME.toLowerCase()}`;
        const category = ensureCategory(
          month,
          key,
          month.gamblingWinningsCategoryKey || key,
          GAMBLING_WINNINGS_CATEGORY_NAME,
          'income',
        );
        category.actual += net.winningsDisplayAmount;
      }
    }

    return byMonth;
  }, [categories, transactions]);

  const monthlyTrend = useMemo(() => {
    const monthlyMap = new Map<
      string,
      {
        key: string;
        label: string;
        short: string;
        spendingActual: number;
        incomeActual: number;
      }
    >();

    const expenseBudgetTotal = expenseCategories.reduce(
      (sum, category) => sum + Number(category.budget || 0),
      0,
    );
    const incomeBudgetTotal = incomeCategories.reduce(
      (sum, category) => sum + Number(category.budget || 0),
      0,
    );

    for (const [monthKey, computed] of monthlyComputed.entries()) {
      const [year, month] = monthKey.split('-').map(Number);
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          key: monthKey,
          label: longMonthFormatter.format(new Date(year, month - 1, 1)),
          short: shortMonthFormatter.format(new Date(year, month - 1, 1)),
          spendingActual: 0,
          incomeActual: 0,
        });
      }

      const entry = monthlyMap.get(monthKey)!;
      entry.spendingActual = roundCurrency(computed.spendingActual);
      entry.incomeActual = roundCurrency(computed.incomeActual);
    }

    if (!monthlyMap.size) {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(monthKey, {
        key: monthKey,
        label: longMonthFormatter.format(new Date(now.getFullYear(), now.getMonth(), 1)),
        short: shortMonthFormatter.format(new Date(now.getFullYear(), now.getMonth(), 1)),
        spendingActual: 0,
        incomeActual: 0,
      });
    }

    return [...monthlyMap.values()]
      .sort((left, right) => (left.key > right.key ? 1 : -1))
      .map((entry) => {
        const spendingActual = roundCurrency(entry.spendingActual);
        const incomeActual = roundCurrency(entry.incomeActual);
        const spendingBudget = roundCurrency(expenseBudgetTotal);
        const incomeBudget = roundCurrency(incomeBudgetTotal);
        const savingsActual = roundCurrency(incomeActual - spendingActual);
        const savingsBudget = roundCurrency(incomeBudget - spendingBudget);

        return {
          ...entry,
          spendingActual,
          spendingBudget,
          incomeActual,
          incomeBudget,
          savingsActual,
          savingsBudget,
        };
      });
  }, [
    expenseCategories,
    incomeCategories,
    longMonthFormatter,
    monthlyComputed,
    shortMonthFormatter,
  ]);

  const monthOptions = useMemo(
    () =>
      [...monthlyTrend]
        .sort((left, right) => (left.key < right.key ? 1 : -1))
        .map((entry) => ({ value: `month:${entry.key}`, label: entry.label, key: entry.key })),
    [monthlyTrend],
  );

  const defaultExplorerMonthKeys = useMemo(
    () => monthlyTrend.slice(Math.max(monthlyTrend.length - 3, 0)).map((entry) => entry.key),
    [monthlyTrend],
  );

  useEffect(() => {
    if (!monthlyTrend.length) {
      setSelectedExplorerMonthKeys([]);
      setDraftExplorerMonthKeys([]);
      return;
    }

    setSelectedExplorerMonthKeys((current) => {
      const valid = current.filter((key) => monthlyTrend.some((entry) => entry.key === key));
      if (valid.length > 0) {
        return valid.slice(0, 12);
      }
      return defaultExplorerMonthKeys;
    });
  }, [defaultExplorerMonthKeys, monthlyTrend]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateViewport);
      return () => mediaQuery.removeEventListener('change', updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    if (!explorerOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-explorer-dropdown-root="true"]')) {
        setExplorerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [explorerOpen]);

  useEffect(() => {
    if (focusCategoryAnalysisNonce <= 0) {
      return;
    }
    categoryAnalysisSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [focusCategoryAnalysisNonce]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => monthOptions[0]?.value || 'month:');
  useEffect(() => {
    if (!monthOptions.length) {
      return;
    }
    if (!monthOptions.some((option) => option.value === selectedPeriod)) {
      setSelectedPeriod(monthOptions[0].value);
    }
  }, [monthOptions, selectedPeriod]);

  const selectedPeriodLabel =
    monthOptions.find((option) => option.value === selectedPeriod)?.label || 'Selected period';

  const selectedRange = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();

    if (selectedPeriod.startsWith('month:')) {
      const monthKey = selectedPeriod.replace('month:', '');
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        const [year, month] = monthKey.split('-').map(Number);
        return {
          start: new Date(year, month - 1, 1),
          end: new Date(year, month, 0),
          budgetMonths: 1,
        };
      }
    }

    return {
      start: new Date(currentYear, today.getMonth(), 1),
      end: new Date(currentYear, today.getMonth() + 1, 0),
      budgetMonths: 1,
    };
  }, [selectedPeriod]);

  const visibleTrendRows = useMemo(() => {
    const selectedSet = new Set(selectedExplorerMonthKeys);
    const visible = monthlyTrend.filter((entry) => selectedSet.has(entry.key));
    if (visible.length) {
      return visible;
    }
    return monthlyTrend.slice(Math.max(monthlyTrend.length - 3, 0));
  }, [monthlyTrend, selectedExplorerMonthKeys]);

  const chartData = visibleTrendRows.map((row) => {
    if (metric === 'income') {
      return {
        key: row.key,
        label: row.label,
        shortLabel: shortLabelFromMonthKey(row.key, row.short),
        actual: row.incomeActual,
        budget: row.incomeBudget,
      };
    }
    if (metric === 'savings') {
      return {
        key: row.key,
        label: row.label,
        shortLabel: shortLabelFromMonthKey(row.key, row.short),
        actual: row.savingsActual,
        budget: row.savingsBudget,
      };
    }
    return {
      key: row.key,
      label: row.label,
      shortLabel: shortLabelFromMonthKey(row.key, row.short),
      actual: row.spendingActual,
      budget: row.spendingBudget,
    };
  });

  const maxChartValue = Math.max(
    1,
    ...chartData.flatMap((entry) => [Math.abs(entry.actual), Math.abs(entry.budget)]),
  );
  const chartSizing = getChartSizing(chartData.length || 1);
  const barAreaHeight = Math.max(170, chartSizing.chartHeight - 90);
  const useCenteredFixedGroups = chartData.length <= 6;
  const chartMinWidth = useMemo(() => {
    if (chartData.length <= 4) {
      return undefined;
    }
    return `${Math.max(440, chartData.length * 68)}px`;
  }, [chartData.length]);
  const mobileChartWidth = useMemo(() => {
    const groupWidth = useCenteredFixedGroups
      ? chartSizing.barWidth * 2 + chartSizing.pairGap + 44
      : 76;
    const gaps = Math.max(0, chartData.length - 1) * chartSizing.groupGap;
    return `${Math.max(560, Math.ceil(chartData.length * groupWidth + gaps + 32))}px`;
  }, [
    chartData.length,
    chartSizing.barWidth,
    chartSizing.groupGap,
    chartSizing.pairGap,
    useCenteredFixedGroups,
  ]);

  function syncChartScroll(source: 'viewport' | 'rail') {
    const sourceElement = source === 'viewport' ? chartViewportRef.current : chartRailRef.current;
    const targetElement = source === 'viewport' ? chartRailRef.current : chartViewportRef.current;
    if (!sourceElement || !targetElement || chartSyncingRef.current) {
      return;
    }
    chartSyncingRef.current = true;
    targetElement.scrollLeft = sourceElement.scrollLeft;
    requestAnimationFrame(() => {
      chartSyncingRef.current = false;
    });
  }

  const averageOverspend = useMemo(() => {
    const overs = monthlyTrend
      .map((row) => row.spendingActual - row.spendingBudget)
      .filter((value) => value > 0);
    return overs.length ? overs.reduce((sum, value) => sum + value, 0) / overs.length : 0;
  }, [monthlyTrend]);

  const categoryRows = useMemo(() => {
    const budgetById = new Map<string, number>();
    const budgetByNameAndType = new Map<string, number>();
    for (const category of categories) {
      budgetById.set(category.id, Number(category.budget || 0));
      budgetByNameAndType.set(
        `${category.categoryType}|${String(category.name || '').trim().toLowerCase()}`,
        Number(category.budget || 0),
      );
    }

    const selectedMonths: string[] = [];
    for (const [monthKey] of monthlyComputed.entries()) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      if (monthStart >= selectedRange.start && monthStart <= selectedRange.end) {
        selectedMonths.push(monthKey);
      }
    }
    if (!selectedMonths.length && selectedPeriod.startsWith('month:')) {
      const monthKey = selectedPeriod.replace('month:', '');
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        selectedMonths.push(monthKey);
      }
    }

    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        type: 'income' | 'expense';
        actual: number;
      }
    >();

    for (const monthKey of selectedMonths) {
      const month = monthlyComputed.get(monthKey);
      if (!month) {
        continue;
      }
      for (const [key, category] of month.categories.entries()) {
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: category.id,
            name: category.name,
            type: category.type,
            actual: 0,
          });
        }
        grouped.get(key)!.actual += category.actual;
      }
    }

    const toRow = (entry: { id: string; name: string; type: 'income' | 'expense'; actual: number }, index: number) => {
      const budgetSource =
        (entry.id && budgetById.has(entry.id) ? budgetById.get(entry.id) : undefined) ??
        budgetByNameAndType.get(`${entry.type}|${entry.name.toLowerCase()}`) ??
        0;
      const budget = roundCurrency(Number(budgetSource || 0) * selectedRange.budgetMonths);
      const actual = roundCurrency(entry.actual);
      return {
        id: entry.id,
        name: entry.name,
        budget,
        actual,
        variance: roundCurrency(actual - budget),
        color: dotPalette[index % dotPalette.length],
      };
    };

    const incomeRows = [...grouped.values()]
      .filter((entry) => entry.type === 'income')
      .sort((left, right) => right.actual - left.actual)
      .map((entry, index) => toRow(entry, index));

    const expenseRows = [...grouped.values()]
      .filter((entry) => entry.type === 'expense')
      .sort((left, right) => right.actual - left.actual)
      .map((entry, index) => toRow(entry, incomeRows.length + index));

    return { incomeRows, expenseRows };
  }, [
    categories,
    monthlyComputed,
    selectedPeriod,
    selectedRange.budgetMonths,
    selectedRange.end,
    selectedRange.start,
  ]);

  const incomeTableRows = categoryRows.incomeRows;
  const expenseTableRows = categoryRows.expenseRows;

  const incomeTotals = incomeTableRows.reduce(
    (acc, row) => ({
      budget: acc.budget + row.budget,
      actual: acc.actual + row.actual,
      variance: acc.variance + row.variance,
    }),
    { budget: 0, actual: 0, variance: 0 },
  );

  const expenseTotals = expenseTableRows.reduce(
    (acc, row) => ({
      budget: acc.budget + row.budget,
      actual: acc.actual + row.actual,
      variance: acc.variance + row.variance,
    }),
    { budget: 0, actual: 0, variance: 0 },
  );

  const topOverspend = [...expenseTableRows].sort((a, b) => b.variance - a.variance)[0];
  const topUnderspend = [...expenseTableRows].sort((a, b) => a.variance - b.variance)[0];

  const explorerPills = useMemo(
    () =>
      monthlyTrend
        .filter((entry) => selectedExplorerMonthKeys.includes(entry.key))
        .sort((left, right) => (left.key > right.key ? 1 : -1)),
    [monthlyTrend, selectedExplorerMonthKeys],
  );

  const filteredExplorerOptions = useMemo(() => {
    const query = explorerQuery.trim().toLowerCase();
    if (!query) {
      return monthOptions;
    }
    return monthOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [explorerQuery, monthOptions]);

  return (
    <div className="w-full space-y-4">
      <section className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <article
            ref={categoryAnalysisSectionRef}
            className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] max-md:mx-auto max-md:w-[406px] max-md:max-w-[calc(100vw-24px)]"
          >
            <header className="flex flex-col items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:flex-row sm:px-5">
              <div>
                <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[1.9rem]">Monthly Trend Explorer</h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Switch the metric to review Spending, Income, or Savings month by month.</p>
              </div>
              <button type="button" className="text-sm font-semibold text-[var(--color-accent)]">View raw monthly data →</button>
            </header>

            <div className="space-y-4 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex w-full flex-wrap rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5 sm:w-auto">
                    {[
                      { id: 'spending', label: 'Spending' },
                      { id: 'income', label: 'Income' },
                      { id: 'savings', label: 'Savings' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMetric(tab.id as Metric)}
                        className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex-none ${
                          metric === tab.id
                            ? 'bg-[var(--color-text-primary)] text-white'
                            : 'text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:min-w-[320px] sm:max-w-[520px] sm:flex-1" data-explorer-dropdown-root="true">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftExplorerMonthKeys([...selectedExplorerMonthKeys]);
                        setExplorerQuery('');
                        setExplorerOpen((open) => !open);
                      }}
                      className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left shadow-[var(--shadow-sm)]"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {explorerPills.length > 0 ? (
                          explorerPills.map((item) => (
                            <span
                              key={item.key}
                              className="rounded-full border border-[#D4EBDF] bg-[#EDF7F2] px-2 py-1 text-[10px] font-semibold text-[#27795A]"
                            >
                              {item.label}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs font-medium text-[var(--color-text-muted)]">
                            Select months
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-[var(--color-text-secondary)]">▾</span>
                    </button>

                    {explorerOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_18px_50px_rgba(18,23,38,0.10)]">
                        <input
                          value={explorerQuery}
                          onChange={(event) => setExplorerQuery(event.target.value)}
                          placeholder="Search months like Jan 2026"
                          className="mb-2.5 h-9 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-xs font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        />
                        <div className="max-h-[250px] space-y-1 overflow-auto pr-1">
                          {filteredExplorerOptions.map((option) => {
                            const checked = draftExplorerMonthKeys.includes(option.key);
                            return (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                  setDraftExplorerMonthKeys((current) => {
                                    const exists = current.includes(option.key);
                                    if (exists) {
                                      return current.filter((key) => key !== option.key);
                                    }
                                    if (current.length >= 12) {
                                      return current;
                                    }
                                    return [...current, option.key].sort((left, right) =>
                                      left > right ? 1 : -1,
                                    );
                                  });
                                }}
                                className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-alt)]"
                              >
                                <span>{option.label}</span>
                                <span
                                  className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] border text-[10px] ${
                                    checked
                                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                                      : 'border-[var(--color-border-strong)] text-transparent'
                                  }`}
                                >
                                  ✓
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t border-[var(--color-border)] pt-2.5">
                          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                            Choose up to 12 months
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDraftExplorerMonthKeys(defaultExplorerMonthKeys)}
                              className="rounded-[8px] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                            >
                              Reset to last 3
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (draftExplorerMonthKeys.length === 0) {
                                  return;
                                }
                                setSelectedExplorerMonthKeys(draftExplorerMonthKeys.slice(0, 12));
                                setExplorerOpen(false);
                              }}
                              className="rounded-[8px] bg-[var(--color-text-primary)] px-2.5 py-1 text-[11px] font-semibold text-white"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--color-accent)]" />
                    Actual
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[#CFEDE0]" />
                    Budget
                  </span>
                </div>
              </div>

              <div
                ref={chartViewportRef}
                onScroll={() => syncChartScroll('viewport')}
                className="overflow-x-auto rounded-[14px] border border-[var(--color-border)] bg-gradient-to-b from-white to-[#FCFBF9] p-2 pb-3 sm:p-4"
              >
                <div
                  className={`relative flex items-end border-b border-[var(--color-border)] pb-8 ${
                    useCenteredFixedGroups ? 'justify-center' : 'justify-between'
                  }`}
                  style={{
                    height: `${chartSizing.chartHeight}px`,
                    columnGap: `${chartSizing.groupGap}px`,
                    width: isMobileViewport ? mobileChartWidth : undefined,
                    minWidth: isMobileViewport ? undefined : chartMinWidth,
                  }}
                >
                  {[20, 40, 60, 80].map((line) => (
                    <div
                      key={line}
                      className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-[var(--color-border-strong)]/70"
                      style={{ bottom: `${line}%` }}
                    />
                  ))}
                  {chartData.map((entry) => {
                    const actualHeight = Math.max(3, (Math.abs(entry.actual) / maxChartValue) * barAreaHeight);
                    const budgetHeight = Math.max(3, (Math.abs(entry.budget) / maxChartValue) * barAreaHeight);
                    return (
                      <div
                        key={entry.key}
                        className={`z-10 flex min-w-[28px] flex-col items-center gap-2 ${
                          useCenteredFixedGroups ? 'flex-none' : 'flex-1'
                        }`}
                        style={
                          useCenteredFixedGroups
                            ? { width: `${chartSizing.barWidth * 2 + chartSizing.pairGap + 44}px` }
                            : undefined
                        }
                      >
                        <div
                          className="flex w-full items-end justify-center"
                          style={{ height: `${barAreaHeight}px`, columnGap: `${chartSizing.pairGap}px` }}
                        >
                          <div
                            className="relative flex items-end justify-center rounded-t-[8px] bg-[var(--color-accent)]"
                            style={{ height: `${actualHeight}px`, width: `${chartSizing.barWidth}px` }}
                          >
                            <span
                              className="pointer-events-none absolute whitespace-nowrap font-bold text-[var(--color-accent-dark)]"
                              style={{
                                top: `${-chartSizing.labelOffset}px`,
                                fontSize: `${chartSizing.labelFontSize}px`,
                                lineHeight: 1,
                              }}
                            >
                              {formatCurrencyCompact(entry.actual)}
                            </span>
                          </div>
                          <div
                            className="relative flex items-end justify-center rounded-t-[8px] bg-[#CFEDE0]"
                            style={{ height: `${budgetHeight}px`, width: `${chartSizing.barWidth}px` }}
                          >
                            <span
                              className="pointer-events-none absolute whitespace-nowrap font-bold text-[#8fb9aa]"
                              style={{
                                top: `${-chartSizing.labelOffset}px`,
                                fontSize: `${chartSizing.labelFontSize}px`,
                                lineHeight: 1,
                              }}
                            >
                              {formatCurrencyCompact(entry.budget)}
                            </span>
                          </div>
                        </div>
                        <p
                          className="font-semibold text-[var(--color-text-secondary)]"
                          style={{ fontSize: `${chartSizing.xAxisFontSize}px` }}
                        >
                          {entry.shortLabel}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1 px-1 md:hidden">
                <div
                  ref={chartRailRef}
                  onScroll={() => syncChartScroll('rail')}
                  className="overflow-x-auto"
                >
                  <div
                    style={{ width: mobileChartWidth, height: '10px' }}
                    className="rounded-full bg-[var(--color-border)]/70"
                  />
                </div>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] max-md:mx-auto max-md:w-[406px] max-md:max-w-[calc(100vw-24px)]">
            <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[1.9rem]">Category Performance Analysis</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">View category budgets versus actual spend for the selected period.</p>
            </header>

            <div className="space-y-3 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                >
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden overflow-x-auto rounded-[14px] border border-[var(--color-border)] md:block">
                <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border)] bg-[#FBFAF8] px-4 py-3">
                  {['Category', 'Actual Spend', 'Variance', 'Budget'].map((head) => (
                    <p key={head} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                      {head}
                    </p>
                  ))}
                </div>
                <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border-strong)] bg-[var(--color-accent-light)]/45 px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-dark)]">
                    Income Categories
                  </p>
                  <p />
                  <p />
                  <p />
                </div>
                {incomeTableRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border)] px-4 py-3">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
                      {row.name}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatCurrency(row.actual)}</p>
                    <p className={`text-sm font-semibold ${row.variance > 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'}`}>
                      {row.variance <= 0 ? '−' : '+'}
                      {formatCurrency(Math.abs(row.variance))}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatCurrency(row.budget)}</p>
                  </div>
                ))}
                <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border-strong)] bg-[#FCFBF9] px-4 py-3">
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">Income Total</p>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(incomeTotals.actual)}</p>
                  <p className={`text-sm font-bold ${incomeTotals.variance > 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'}`}>
                    {incomeTotals.variance <= 0 ? '−' : '+'}
                    {formatCurrency(Math.abs(incomeTotals.variance))}
                  </p>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(incomeTotals.budget)}</p>
                </div>

                <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border-strong)] bg-[#F5F8FB] px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-primary)]">
                    Expense Categories
                  </p>
                  <p />
                  <p />
                  <p />
                </div>
                {expenseTableRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 border-b border-[var(--color-border)] px-4 py-3">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
                      {row.name}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatCurrency(row.actual)}</p>
                    <p className={`text-sm font-semibold ${row.variance <= 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'}`}>
                      {row.variance <= 0 ? '−' : '+'}
                      {formatCurrency(Math.abs(row.variance))}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatCurrency(row.budget)}</p>
                  </div>
                ))}
                <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.9fr] gap-2 bg-[#FCFBF9] px-4 py-3">
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">Expense Total</p>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(expenseTotals.actual)}</p>
                  <p className={`text-sm font-bold ${expenseTotals.variance <= 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'}`}>
                    {expenseTotals.variance <= 0 ? '−' : '+'}
                    {formatCurrency(Math.abs(expenseTotals.variance))}
                  </p>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatCurrency(expenseTotals.budget)}</p>
                </div>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                <article className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="border-b border-[var(--color-border)] bg-[var(--color-accent-light)]/45 px-4 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-dark)]">
                      Income Categories
                    </p>
                  </div>
                  <div className="space-y-2.5 p-3">
                    {incomeTableRows.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[#FBFAF8] p-3"
                      >
                        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
                          {row.name}
                        </p>
                        <div className="mt-2 space-y-2">
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Actual
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                              {formatCurrency(row.actual)}
                            </p>
                          </div>
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Variance
                            </p>
                            <p
                              className={`mt-1 text-sm font-semibold ${
                                row.variance > 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
                              }`}
                            >
                              {row.variance <= 0 ? '−' : '+'}
                              {formatCurrency(Math.abs(row.variance))}
                            </p>
                          </div>
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Budget
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                              {formatCurrency(row.budget)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-[12px] border border-[var(--color-border)] bg-[#FCFBF9] p-3">
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">Income Total</p>
                      <div className="mt-2 space-y-2">
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Actual
                          </p>
                          <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">
                            {formatCurrency(incomeTotals.actual)}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Variance
                          </p>
                          <p
                            className={`mt-1 text-sm font-bold ${
                            incomeTotals.variance > 0
                              ? 'text-[var(--color-accent-dark)]'
                              : 'text-[var(--color-negative)]'
                            }`}
                          >
                            {incomeTotals.variance <= 0 ? '−' : '+'}
                            {formatCurrency(Math.abs(incomeTotals.variance))}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Budget
                          </p>
                          <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">
                            {formatCurrency(incomeTotals.budget)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="border-b border-[var(--color-border)] bg-[#F5F8FB] px-4 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-primary)]">
                      Expense Categories
                    </p>
                  </div>
                  <div className="space-y-2.5 p-3">
                    {expenseTableRows.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[#FBFAF8] p-3"
                      >
                        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
                          {row.name}
                        </p>
                        <div className="mt-2 space-y-2">
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Actual
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                              {formatCurrency(row.actual)}
                            </p>
                          </div>
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Variance
                            </p>
                            <p
                              className={`mt-1 text-sm font-semibold ${
                                row.variance <= 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
                              }`}
                            >
                              {row.variance <= 0 ? '−' : '+'}
                              {formatCurrency(Math.abs(row.variance))}
                            </p>
                          </div>
                          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                              Budget
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                              {formatCurrency(row.budget)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-[12px] border border-[var(--color-border)] bg-[#FCFBF9] p-3">
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">Expense Total</p>
                      <div className="mt-2 space-y-2">
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Actual
                          </p>
                          <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">
                            {formatCurrency(expenseTotals.actual)}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Variance
                          </p>
                          <p
                            className={`mt-1 text-sm font-bold ${
                            expenseTotals.variance <= 0
                              ? 'text-[var(--color-accent-dark)]'
                              : 'text-[var(--color-negative)]'
                            }`}
                          >
                            {expenseTotals.variance <= 0 ? '−' : '+'}
                            {formatCurrency(Math.abs(expenseTotals.variance))}
                          </p>
                        </div>
                        <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Budget
                          </p>
                          <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">
                            {formatCurrency(expenseTotals.budget)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </article>
        </div>

      </section>
    </div>
  );
}
