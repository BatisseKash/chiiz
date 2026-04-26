import type { Category, SummaryMetric } from '../types';

export const defaultCategories: Category[] = [
  { id: 'rent', name: 'Rent', budget: 2300, actual: 2300, categoryType: 'expense', source: 'user', status: 'active' },
  { id: 'dining', name: 'Dining', budget: 550, actual: 618, categoryType: 'expense', source: 'user', status: 'active' },
  { id: 'car', name: 'Car', budget: 420, actual: 366, categoryType: 'expense', source: 'user', status: 'active' },
  { id: 'groceries', name: 'Groceries', budget: 700, actual: 642, categoryType: 'expense', source: 'user', status: 'active' },
  { id: 'shopping', name: 'Shopping', budget: 350, actual: 412, categoryType: 'expense', source: 'user', status: 'active' },
  { id: 'travel', name: 'Travel', budget: 500, actual: 274, categoryType: 'expense', source: 'user', status: 'active' },
];

export const monthlyIncome = 9200;

export const summaryFromCategories = (
  categories: Category[],
  expensesOverride?: number,
): SummaryMetric[] => {
  const fallbackExpenses = categories.reduce((sum, category) => sum + category.actual, 0);
  const expenses = expensesOverride ?? fallbackExpenses;
  const budgeted = categories.reduce((sum, category) => sum + category.budget, 0);
  const savings = monthlyIncome - expenses;
  const remaining = budgeted - expenses;

  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return [
    {
      label: 'Monthly Income',
      value: currency.format(monthlyIncome),
      change: '+4.2% vs last month',
    },
    {
      label: 'Monthly Expenses',
      value: currency.format(expenses),
      change: '-1.8% vs last month',
    },
    {
      label: 'Savings Amount',
      value: currency.format(savings),
      change: `${Math.round((savings / monthlyIncome) * 100)}% saved`,
    },
    {
      label: 'Remaining Per Budget',
      value: currency.format(remaining),
      change: `${remaining >= 0 ? 'On track' : 'Over plan'} this month`,
    },
  ];
};
