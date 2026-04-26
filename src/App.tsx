import { useEffect, useMemo, useState } from 'react';
import { CategoryForm } from './components/CategoryForm';
import { MobileNavDrawer } from './components/MobileNavDrawer';
import { AskChiizChat } from './components/AskChiizChat';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import {
  askChiiz,
  assignBudgetMonths,
  categorizeTransactions,
  createBudget,
  createCategory,
  createManualTransaction,
  deleteManualTransaction,
  createCustomCategorySuggestion,
  deleteBudget,
  deleteCategory,
  duplicateBudget,
  fetchAccounts,
  fetchBudgets,
  fetchCategories,
  fetchLinkedAccounts,
  fetchTransactions,
  fetchCategorySuggestions,
  fetchUnifiedMonthlyCategoryAmounts,
  generateAiCategories,
  launchPlaidLink,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  restoreSession,
  signupUser,
  syncLinkedAccounts,
  unassignBudgetMonths,
  overrideTransactionCategory,
  updateBudget,
  updateCategory,
} from './lib/api';
import { formatCurrency } from './lib/format';
import {
  applyGamblingMonthlyNetting,
  getMonthlyGamblingNetAmounts,
  isGamblingExpenseCategoryName,
  isGamblingWinningsCategoryName,
} from './lib/gamblingNetting';
import type {
  AuthUser,
  Budget,
  BudgetMonthAssignment,
  Category,
  LinkedAccount,
  LinkedPlaidItem,
  SummaryMetric,
  PlaidTransaction,
  SyncSummary,
  UnifiedMonthlyCategoryAmount,
  View,
} from './types';
import { AuthView } from './views/AuthView';
import { CategoriesView } from './views/CategoriesView';
import { DashboardView } from './views/DashboardView';
import { PerformanceView } from './views/PerformanceView';
import { SettingsView } from './views/SettingsView';
import { TransactionsView } from './views/TransactionsView';
import { UploadDataView } from './views/UploadDataView';

const AUTH_STORAGE_KEY = 'chiiz.current-user';
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

type DashboardTimePreset = 'month' | 'ytd' | 'last12' | 'all_time';
type TransactionTypeFilter = 'all' | 'expense' | 'income';
type SelectOption = { value: string; label: string };

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function monthValueFromDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthLabelFromValue(value: string) {
  const [year, month] = value.split('-').map(Number);
  return monthFormatter.format(new Date(year, month - 1, 1));
}

function addMonths(baseDate: Date, monthsToAdd: number) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + monthsToAdd, 1);
}

function countMonthsInclusive(start: Date, end: Date) {
  const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
  const endMonthIndex = end.getFullYear() * 12 + end.getMonth();
  return Math.max(1, endMonthIndex - startMonthIndex + 1);
}

function getDashboardRange(
  preset: DashboardTimePreset,
  selectedMonths: string[],
  selectedYear: string,
  monthOptions: SelectOption[],
) {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (preset === 'month') {
    const labels = selectedMonths
      .map((monthValue) => monthOptions.find((option) => option.value === monthValue)?.label)
      .filter(Boolean) as string[];
    if (!labels.length) {
      return { start: now, end: now, label: 'No months selected' };
    }
    if (labels.length <= 2) {
      return { start: now, end: now, label: labels.join(' • ') };
    }
    return { start: now, end: now, label: `${labels.length} selected months` };
  }

  if (preset === 'ytd') {
    const year = Number(selectedYear);
    const start = new Date(year, 0, 1);
    // Current year YTD ends today; past years use full year.
    const end = year === currentYear ? now : new Date(year, 11, 31);
    const label = year === currentYear ? `YTD ${year} (Jan 1 - today)` : `YTD ${year} (full year)`;
    return { start, end, label };
  }

  if (preset === 'last12') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const label = `${monthFormatter.format(start)} - ${monthFormatter.format(end)}`;
    return { start, end, label };
  }

  const allMonthValues = monthOptions.map((option) => option.value).sort((left, right) =>
    left > right ? 1 : -1,
  );
  const firstMonth = allMonthValues[0] || monthValueFromDate(now);
  const lastMonth = allMonthValues[allMonthValues.length - 1] || monthValueFromDate(now);
  const [startYear, startMonth] = firstMonth.split('-').map(Number);
  const [endYear, endMonth] = lastMonth.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth, 0);
  const label = `All Time (${monthFormatter.format(start)} - ${monthFormatter.format(end)})`;
  return { start, end, label };
}

function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const savedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return savedUser ? (JSON.parse(savedUser) as AuthUser) : null;
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySets, setCategorySets] = useState<Budget[]>([]);
  const [categorySetAssignments, setCategorySetAssignments] = useState<BudgetMonthAssignment[]>([]);
  const [selectedCategorySetId, setSelectedCategorySetId] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [plaidStatus, setPlaidStatus] = useState('Ready to connect');
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [linkedItems, setLinkedItems] = useState<LinkedPlaidItem[]>([]);
  const [manualAccounts, setManualAccounts] = useState<LinkedAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [unifiedMonthlyCategoryAmounts, setUnifiedMonthlyCategoryAmounts] = useState<
    UnifiedMonthlyCategoryAmount[]
  >([]);
  const [manualTransactionModalOpen, setManualTransactionModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusPerformanceCategoryAnalysisNonce, setFocusPerformanceCategoryAnalysisNonce] =
    useState(0);
  const [dashboardTimePreset, setDashboardTimePreset] = useState<DashboardTimePreset>('month');
  const [dashboardSelectedMonths, setDashboardSelectedMonths] = useState<string[]>([]);
  const [dashboardYear, setDashboardYear] = useState(() => String(new Date().getFullYear()));
  const [dashboardAccount, setDashboardAccount] = useState('all');
  const [dashboardCategory, setDashboardCategory] = useState('all');
  const [dashboardTransactionType, setDashboardTransactionType] = useState<TransactionTypeFilter>('all');

  const transactionsWithDate = useMemo(
    () =>
      transactions
        .map((transaction) => ({
          transaction,
          parsedDate: parseIsoDate(transaction.date),
        }))
        .filter((entry) => entry.parsedDate),
    [transactions],
  );

  const availableYears = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear]);
    for (const entry of transactionsWithDate) {
      years.add(entry.parsedDate!.getFullYear());
    }
    return [...years].sort((left, right) => right - left);
  }, [transactionsWithDate]);

  const monthOptions = useMemo<SelectOption[]>(() => {
    const monthValues = new Set<string>();
    for (const row of unifiedMonthlyCategoryAmounts) {
      if (/^\d{4}-\d{2}$/.test(row.monthKey)) {
        monthValues.add(row.monthKey);
      }
    }
    const values = [...monthValues].sort((left, right) => (left < right ? 1 : -1));
    return values.map((value) => ({ value, label: monthLabelFromValue(value) }));
  }, [unifiedMonthlyCategoryAmounts]);

  const nettedUnifiedMonthlyCategoryAmounts = useMemo(
    () => applyGamblingMonthlyNetting(unifiedMonthlyCategoryAmounts),
    [unifiedMonthlyCategoryAmounts],
  );

  const yearOptions = useMemo<SelectOption[]>(
    () => availableYears.map((year) => ({ value: String(year), label: String(year) })),
    [availableYears],
  );

  const accountOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, string>();
    for (const transaction of transactions) {
      if (!transaction.plaid_account_id) {
        continue;
      }
      const institution = transaction.institution_name || 'Institution';
      const account = transaction.account_name || 'Account';
      map.set(transaction.plaid_account_id, `${institution} • ${account}`);
    }

    return [
      { value: 'all', label: 'All accounts' },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [transactions]);

  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All categories' },
      ...categories.map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories],
  );

  const categoryTypeById = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>();
    for (const category of categories) {
      map.set(category.id, category.categoryType);
    }
    return map;
  }, [categories]);

  const assignmentMonthOptions = useMemo(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1);
    return Array.from({ length: 24 }, (_, index) => {
      const date = addMonths(start, index);
      const value = monthValueFromDate(date);
      return { value, label: monthLabelFromValue(value) };
    });
  }, []);

  const selectedCategorySet = useMemo(
    () => categorySets.find((set) => set.id === selectedCategorySetId) || null,
    [categorySets, selectedCategorySetId],
  );

  const selectedSetMonthAssignments = useMemo(
    () =>
      categorySetAssignments
        .filter((assignment) => assignment.budgetId === selectedCategorySetId)
        .map((assignment) => assignment.monthKey),
    [categorySetAssignments, selectedCategorySetId],
  );

  useEffect(() => {
    if (!monthOptions.length) {
      setDashboardSelectedMonths([]);
      return;
    }

    setDashboardSelectedMonths((current) => {
      const valid = current.filter((monthKey) =>
        monthOptions.some((option) => option.value === monthKey),
      );
      if (valid.length > 0) {
        return valid.slice(0, 12);
      }

      const currentMonth = monthValueFromDate(new Date());
      if (monthOptions.some((option) => option.value === currentMonth)) {
        return [currentMonth];
      }

      return [monthOptions[0].value];
    });
  }, [monthOptions]);

  useEffect(() => {
    if (yearOptions.length > 0 && !yearOptions.some((option) => option.value === dashboardYear)) {
      setDashboardYear(yearOptions[0].value);
    }
  }, [dashboardYear, yearOptions]);

  useEffect(() => {
    if (
      accountOptions.length > 0 &&
      !accountOptions.some((option) => option.value === dashboardAccount)
    ) {
      setDashboardAccount('all');
    }
  }, [accountOptions, dashboardAccount]);

  useEffect(() => {
    if (
      categoryOptions.length > 0 &&
      !categoryOptions.some((option) => option.value === dashboardCategory)
    ) {
      setDashboardCategory('all');
    }
  }, [categoryOptions, dashboardCategory]);

  const askChiizMonthKey = useMemo(() => {
    if (dashboardSelectedMonths.length > 0) {
      return dashboardSelectedMonths[0];
    }
    if (monthOptions.length > 0) {
      return monthOptions[0].value;
    }
    return monthValueFromDate(new Date());
  }, [dashboardSelectedMonths, monthOptions]);

  const dashboardRange = useMemo(
    () => getDashboardRange(dashboardTimePreset, dashboardSelectedMonths, dashboardYear, monthOptions),
    [dashboardSelectedMonths, dashboardTimePreset, dashboardYear, monthOptions],
  );

  const filteredUnifiedMonthlyRows = useMemo(() => {
    const selectedMonthSet = new Set(dashboardSelectedMonths);
    const rangeStartMonth = monthValueFromDate(dashboardRange.start);
    const rangeEndMonth = monthValueFromDate(dashboardRange.end);

    return nettedUnifiedMonthlyCategoryAmounts.filter((row) => {
      const monthKey = row.monthKey;
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return false;
      }

      if (dashboardTimePreset === 'month') {
        if (selectedMonthSet.size === 0 || !selectedMonthSet.has(monthKey)) {
          return false;
        }
      } else if (dashboardTimePreset === 'ytd') {
        if (monthKey < `${dashboardYear}-01` || monthKey > `${dashboardYear}-12`) {
          return false;
        }
      } else if (dashboardTimePreset === 'last12') {
        if (monthKey < rangeStartMonth || monthKey > rangeEndMonth) {
          return false;
        }
      }

      if (dashboardCategory !== 'all' && row.categoryId !== dashboardCategory) {
        return false;
      }

      if (dashboardTransactionType !== 'all' && row.categoryType !== dashboardTransactionType) {
        return false;
      }

      return true;
    });
  }, [
    dashboardCategory,
    dashboardRange.end,
    dashboardRange.start,
    dashboardSelectedMonths,
    dashboardTimePreset,
    dashboardTransactionType,
    dashboardYear,
    nettedUnifiedMonthlyCategoryAmounts,
  ]);

  const filteredDashboardTransactions = useMemo(() => {
    const startTs = dashboardRange.start.getTime();
    const endTs = dashboardRange.end.getTime();
    const selectedMonthSet = new Set(dashboardSelectedMonths);

    return transactionsWithDate
      .filter(({ parsedDate, transaction }) => {
        if (transaction.ignored_from_budget) {
          return false;
        }
        const transactionTs = parsedDate!.getTime();
        if (dashboardTimePreset === 'month') {
          if (selectedMonthSet.size === 0) {
            return false;
          }
          const transactionMonth = monthValueFromDate(parsedDate!);
          if (!selectedMonthSet.has(transactionMonth)) {
            return false;
          }
        } else if (
          dashboardTimePreset !== 'all_time' &&
          (transactionTs < startTs || transactionTs > endTs)
        ) {
          return false;
        }

        if (dashboardAccount !== 'all' && transaction.plaid_account_id !== dashboardAccount) {
          return false;
        }

        if (dashboardCategory !== 'all' && transaction.category_id !== dashboardCategory) {
          return false;
        }

        const amount = Number(transaction.amount || 0);
        const resolvedCategoryType =
          transaction.category_type ||
          (transaction.category_id ? categoryTypeById.get(transaction.category_id) || null : null) ||
          (amount < 0 ? 'income' : 'expense');
        if (dashboardTransactionType === 'expense' && resolvedCategoryType !== 'expense') {
          return false;
        }
        if (dashboardTransactionType === 'income' && resolvedCategoryType !== 'income') {
          return false;
        }

        return true;
      })
      .map((entry) => entry.transaction);
  }, [
    dashboardAccount,
    dashboardCategory,
    categoryTypeById,
    dashboardSelectedMonths,
    dashboardRange.end,
    dashboardRange.start,
    dashboardTimePreset,
    dashboardTransactionType,
    transactionsWithDate,
  ]);

  const dashboardCategories = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const actualByCategoryId = new Map<string, number>();
    const gamblingByMonth = new Map<
      string,
      {
        expenseTotal: number;
        winningsTotal: number;
        expenseCategoryIds: Set<string>;
        winningsCategoryIds: Set<string>;
      }
    >();

    for (const transaction of filteredDashboardTransactions) {
      const categoryId = transaction.category_id || '';
      if (!categoryId) {
        continue;
      }

      const category = categoryById.get(categoryId);
      if (!category) {
        continue;
      }

      const amount = Number(transaction.amount || 0);
      const categoryName = transaction.category_name || category.name || '';
      const monthKey = String(transaction.date || '').slice(0, 7);
      const hasMonthKey = /^\d{4}-\d{2}$/.test(monthKey);

      if (hasMonthKey && isGamblingExpenseCategoryName(categoryName) && amount > 0) {
        const entry =
          gamblingByMonth.get(monthKey) ||
          {
            expenseTotal: 0,
            winningsTotal: 0,
            expenseCategoryIds: new Set<string>(),
            winningsCategoryIds: new Set<string>(),
          };
        entry.expenseTotal += amount;
        entry.expenseCategoryIds.add(categoryId);
        gamblingByMonth.set(monthKey, entry);
        continue;
      }

      if (hasMonthKey && isGamblingWinningsCategoryName(categoryName) && amount < 0) {
        const entry =
          gamblingByMonth.get(monthKey) ||
          {
            expenseTotal: 0,
            winningsTotal: 0,
            expenseCategoryIds: new Set<string>(),
            winningsCategoryIds: new Set<string>(),
          };
        entry.winningsTotal += Math.abs(amount);
        entry.winningsCategoryIds.add(categoryId);
        gamblingByMonth.set(monthKey, entry);
        continue;
      }

      const resolvedCategoryType =
        transaction.category_type ||
        category.categoryType ||
        (amount < 0 ? 'income' : 'expense');

      if (resolvedCategoryType === 'income') {
        actualByCategoryId.set(categoryId, (actualByCategoryId.get(categoryId) || 0) + Math.abs(amount));
      } else if (amount > 0) {
        actualByCategoryId.set(categoryId, (actualByCategoryId.get(categoryId) || 0) + amount);
      } else if (amount < 0) {
        // Expense-category credits reduce spend and should match Performance aggregation.
        actualByCategoryId.set(
          categoryId,
          (actualByCategoryId.get(categoryId) || 0) - Math.abs(amount),
        );
      }
    }

    for (const monthEntry of gamblingByMonth.values()) {
      const net = getMonthlyGamblingNetAmounts(monthEntry.expenseTotal, monthEntry.winningsTotal);
      const expenseCategoryId = [...monthEntry.expenseCategoryIds][0];
      const winningsCategoryId = [...monthEntry.winningsCategoryIds][0];
      if (expenseCategoryId && net.expenseDisplayAmount > 0) {
        actualByCategoryId.set(
          expenseCategoryId,
          (actualByCategoryId.get(expenseCategoryId) || 0) + net.expenseDisplayAmount,
        );
      }
      if (winningsCategoryId && net.winningsDisplayAmount > 0) {
        actualByCategoryId.set(
          winningsCategoryId,
          (actualByCategoryId.get(winningsCategoryId) || 0) + net.winningsDisplayAmount,
        );
      }
    }

    let visible = [...categories];
    if (dashboardCategory !== 'all') {
      visible = visible.filter((category) => category.id === dashboardCategory);
    }
    if (dashboardTransactionType !== 'all') {
      visible = visible.filter((category) => category.categoryType === dashboardTransactionType);
    }

    return visible.map((category) => ({
      ...category,
      actual: actualByCategoryId.get(category.id) || 0,
    }));
  }, [categories, dashboardCategory, dashboardTransactionType, filteredDashboardTransactions]);

  const summary = useMemo<SummaryMetric[]>(() => {
    let income = 0;
    let expenses = 0;
    const monthlySummary = new Map<
      string,
      {
        income: number;
        expenses: number;
        gamblingExpenses: number;
        gamblingWinnings: number;
      }
    >();

    for (const transaction of filteredDashboardTransactions) {
      const parsedDate = parseIsoDate(transaction.date);
      if (!parsedDate) {
        continue;
      }
      const monthKey = monthValueFromDate(parsedDate);
      if (!monthlySummary.has(monthKey)) {
        monthlySummary.set(monthKey, {
          income: 0,
          expenses: 0,
          gamblingExpenses: 0,
          gamblingWinnings: 0,
        });
      }

      const entry = monthlySummary.get(monthKey)!;
      const amount = Number(transaction.amount || 0);
      const categoryName = transaction.category_name || '';
      const categoryType =
        transaction.category_type ||
        (transaction.category_id ? categoryTypeById.get(transaction.category_id) || null : null);

      if (isGamblingExpenseCategoryName(categoryName)) {
        if (amount > 0) {
          entry.gamblingExpenses += amount;
        }
        continue;
      }

      if (isGamblingWinningsCategoryName(categoryName)) {
        if (amount < 0) {
          entry.gamblingWinnings += Math.abs(amount);
        }
        continue;
      }

      if (categoryType === 'income') {
        // Income categories should contribute to income regardless of upstream sign conventions.
        entry.income += Math.abs(amount);
        continue;
      }

      if (categoryType === 'expense') {
        if (amount > 0) {
          entry.expenses += amount;
        } else if (amount < 0) {
          // Expense-category credits reduce total spending.
          entry.expenses -= Math.abs(amount);
        }
        continue;
      }

      // Fallback for uncategorized rows.
      if (amount < 0) {
        entry.income += Math.abs(amount);
      } else if (amount > 0) {
        entry.expenses += amount;
      }
    }

    for (const month of monthlySummary.values()) {
      const net = getMonthlyGamblingNetAmounts(month.gamblingExpenses, month.gamblingWinnings);
      income += month.income + net.winningsDisplayAmount;
      expenses += month.expenses + net.expenseDisplayAmount;
    }

    const monthlyBudgetedExpenses = dashboardCategories
      .filter((category) => category.categoryType !== 'income')
      .reduce((sum, category) => sum + category.budget, 0);
    const budgetMonthCount =
      dashboardTimePreset === 'month'
        ? Math.max(1, dashboardSelectedMonths.length)
        : countMonthsInclusive(dashboardRange.start, dashboardRange.end);
    const budgetedExpenses = monthlyBudgetedExpenses * budgetMonthCount;
    const savings = income - expenses;
    const remaining = budgetedExpenses - expenses;
    // Treat sub-$1 income as no income so the savings rate does not explode from tiny residual values.
    const hasIncomeForRate = income >= 1;
    const savingsRate = hasIncomeForRate ? (savings / income) * 100 : null;
    const showSavingsRate = savingsRate !== null && savingsRate >= 0;
    const dashboardLoading = categoriesLoading || plaidLoading;
    const spentPct = budgetedExpenses > 0 ? (expenses / budgetedExpenses) * 100 : 0;

    return [
      {
        label: 'Income',
        value: formatCurrency(income),
        change: `For ${dashboardRange.label}`,
      },
      {
        label: 'Total Spending',
        value: formatCurrency(expenses),
        change: `For ${dashboardRange.label}`,
      },
      {
        label: 'Remaining Budget',
        value: formatCurrency(remaining),
        change: `${Math.round(spentPct)}% spent`,
      },
      {
        label: 'Savings Rate',
        value: dashboardLoading
          ? '—'
          : !showSavingsRate
            ? 'N/A'
            : `${Math.round(savingsRate)}%`,
        change: dashboardLoading
          ? 'Loading...'
          : savingsRate === null
            ? 'No income or negative savings'
            : showSavingsRate
              ? 'Healthy trend'
              : 'No income or negative savings',
      },
    ];
  }, [
    categoryTypeById,
    categoriesLoading,
    plaidLoading,
    dashboardCategories,
    dashboardSelectedMonths.length,
    dashboardRange.label,
    dashboardRange.end,
    dashboardRange.start,
    dashboardTimePreset,
    filteredDashboardTransactions,
  ]);

  const categoriesWithActual = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        actual: transactions
          .filter(
            (transaction) =>
              !transaction.ignored_from_budget && transaction.category_id === category.id,
          )
          .reduce((sum, transaction) => {
            const amount = Number(transaction.amount || 0);
            if (category.categoryType === 'income') {
              return amount < 0 ? sum + Math.abs(amount) : sum;
            }
            return sum + amount;
          }, 0),
      })),
    [categories, transactions],
  );

  const unifiedPerformanceTransactions = useMemo<PlaidTransaction[]>(() => {
    return nettedUnifiedMonthlyCategoryAmounts.map((row) => {
      const amountAbs = Math.abs(Number(row.amount || 0));
      const normalizedAmount =
        row.categoryType === 'income' ? -amountAbs : Number(row.amount || 0);
      return {
        id: `unified-${row.monthKey}-${row.categoryId}-${row.sourceUsed}`,
        transaction_id: `unified-${row.monthKey}-${row.categoryId}-${row.sourceUsed}`,
        name: `${row.categoryName} (${row.monthKey})`,
        transaction_name: `${row.categoryName} (${row.monthKey})`,
        merchant_name: row.categoryName,
        institution_name: row.sourceUsed === 'historical_upload' ? 'Historical Upload' : 'Transactions',
        account_name: null,
        account_type: null,
        plaid_account_id: null,
        category_id: row.categoryId,
        category_name: row.categoryName,
        category_type: row.categoryType,
        categorization_source: row.sourceUsed === 'historical_upload' ? 'mapped' : 'rule',
        ignored_from_budget: false,
        amount: normalizedAmount,
        date: `${row.monthKey}-01`,
        iso_currency_code: 'USD',
        counterparties: [],
      };
    });
  }, [nettedUnifiedMonthlyCategoryAmounts]);

  async function refreshPlaidState() {
    const [linkedAccountsResult, storedTransactionsResult, accountsResult, unifiedRowsResult] =
      await Promise.allSettled([
        fetchLinkedAccounts(),
        fetchTransactions(),
        fetchAccounts(),
        fetchUnifiedMonthlyCategoryAmounts(),
      ]);

    if (linkedAccountsResult.status === 'fulfilled') {
      setLinkedItems(linkedAccountsResult.value.items);
      setAccountCount(linkedAccountsResult.value.total_accounts);
    }

    if (storedTransactionsResult.status === 'fulfilled') {
      setTransactions(storedTransactionsResult.value.transactions);
    }

    if (accountsResult.status === 'fulfilled') {
      setManualAccounts(accountsResult.value.accounts || []);
    }

    if (unifiedRowsResult.status === 'fulfilled') {
      setUnifiedMonthlyCategoryAmounts(unifiedRowsResult.value.rows || []);
    } else {
      setUnifiedMonthlyCategoryAmounts([]);
    }

    if (
      linkedAccountsResult.status === 'rejected' &&
      storedTransactionsResult.status === 'rejected' &&
      accountsResult.status === 'rejected'
    ) {
      throw storedTransactionsResult.reason || linkedAccountsResult.reason || accountsResult.reason;
    }
  }

  async function refreshCategories(categorySetId: string | null = selectedCategorySetId) {
    const response = await fetchCategories(categorySetId || undefined);
    setCategories(response.activeCategories);
    const resolvedBudgetId = response.resolvedBudgetId || response.resolvedSetId || null;
    if (!selectedCategorySetId && resolvedBudgetId) {
      setSelectedCategorySetId(resolvedBudgetId);
    }
  }

  async function refreshCategorySets(preferredSetId?: string | null) {
    const data = await fetchBudgets();
    const budgets = data.budgets || data.categorySets || [];
    const budgetMonthAssignments = data.budgetMonthAssignments || data.monthAssignments || [];
    const resolvedBudgetId = data.resolvedBudgetId || data.resolvedSetId || null;
    setCategorySets(budgets);
    setCategorySetAssignments(budgetMonthAssignments);
    setSelectedCategorySetId((current) =>
      preferredSetId && budgets.some((set) => set.id === preferredSetId)
        ? preferredSetId
        : current && budgets.some((set) => set.id === current)
          ? current
          : resolvedBudgetId || budgets[0]?.id || null,
    );
  }

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setCategoriesLoading(true);

    void (async () => {
      try {
        await refreshPlaidState();
        const sets = await fetchBudgets();
        const budgets = sets.budgets || sets.categorySets || [];
        const budgetMonthAssignments = sets.budgetMonthAssignments || sets.monthAssignments || [];
        setCategorySets(budgets);
        setCategorySetAssignments(budgetMonthAssignments);
        const resolved = sets.resolvedBudgetId || sets.resolvedSetId || budgets[0]?.id || null;
        setSelectedCategorySetId(resolved);
        await refreshCategories(resolved);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load linked accounts.';
        if (message.includes('logged in')) {
          setCurrentUser(null);
          return;
        }
        setPlaidStatus(message);
      } finally {
        setCategoriesLoading(false);
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      return;
    }

    restoreSession()
      .then((response) => {
        setCurrentUser(response.user);
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedCategorySetId) {
      return;
    }

    void refreshCategories(selectedCategorySetId);
  }, [currentUser, selectedCategorySetId]);

  async function withPlaidAction(action: () => Promise<void>) {
    try {
      setPlaidLoading(true);
      await action();
      await refreshPlaidState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      setPlaidStatus(message);
    } finally {
      setPlaidLoading(false);
    }
  }

  function syncStatusMessage(sync: SyncSummary, fallback: string) {
    if (sync.failed_items.length > 0) {
      return `${fallback} Some institutions still need attention.`;
    }

    if (sync.total_items === 0) {
      return fallback;
    }

    return `${fallback} Synced ${sync.synced_items.length} linked institution${sync.synced_items.length === 1 ? '' : 's'}.`;
  }

  async function handleSaveCategory(payload: {
    name: string;
    description: string;
    budget: number;
    categoryType: 'income' | 'expense';
  }) {
    if (!selectedCategorySetId) {
      throw new Error('Select or create a category set first.');
    }

    if (editingCategory) {
      await updateCategory(editingCategory.id, {
        name: payload.name,
        description: payload.description || null,
        budget: payload.budget,
        categoryType: payload.categoryType,
      });
    } else {
      await createCategory({
        budgetId: selectedCategorySetId,
        name: payload.name,
        description: payload.description || null,
        budget: payload.budget,
        categoryType: payload.categoryType,
      });
    }

    await refreshCategories(selectedCategorySetId);
    setEditingCategory(null);
    setFormOpen(false);
  }

  async function handleLogin(payload: { email: string; password: string }) {
    try {
      setAuthLoading(true);
      setAuthError(null);
      const response = await loginUser(payload);
      setCurrentUser(response.user);
      setPlaidStatus(syncStatusMessage(response.sync, 'Signed in successfully.'));

      // Keep login fast: run transaction sync in the background after auth succeeds.
      void (async () => {
        try {
          const refreshed = await syncLinkedAccounts();
          setPlaidStatus(syncStatusMessage(refreshed.sync, 'Synced latest transactions.'));
          await refreshPlaidState();
        } catch (error) {
          // Background sync failures should not block login success.
          const message =
            error instanceof Error
              ? error.message
              : 'Background transaction sync failed. Showing latest available data.';
          setPlaidStatus(message);
        }
      })();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log in.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignup(payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }) {
    try {
      setAuthLoading(true);
      setAuthError(null);
      const response = await signupUser(payload);
      setCurrentUser(response.user);
      setPlaidStatus(syncStatusMessage(response.sync, 'Account created successfully.'));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestPasswordReset(payload: { email: string }) {
    try {
      setAuthLoading(true);
      setAuthError(null);
      return await requestPasswordReset(payload);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send reset email.');
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPassword(payload: { token: string; password: string }) {
    try {
      setAuthLoading(true);
      setAuthError(null);
      return await resetPassword(payload);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to reset password.');
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await logoutUser();
    } catch (error) {
      // The UI can still sign out locally if the logout request fails.
    }

    setCurrentUser(null);
    setActiveView('dashboard');
    setAuthError(null);
    setTransactions([]);
    setLinkedItems([]);
    setAccountCount(null);
    setCategories([]);
    setCategorySets([]);
    setCategorySetAssignments([]);
    setSelectedCategorySetId(null);
    setManualAccounts([]);
    setUnifiedMonthlyCategoryAmounts([]);
    setManualTransactionModalOpen(false);
    setMobileNavOpen(false);
  }

  async function handleCreateCategorySet(payload: {
    name: string;
    isLatest: boolean;
    months: string[];
  }) {
    const created = await createBudget({ name: payload.name, isDefault: payload.isLatest });
    const createdBudget = created.budget || created.categorySet;
    if (!createdBudget) {
      throw new Error('Failed to create budget.');
    }
    if (!payload.isLatest && payload.months.length > 0) {
      await assignBudgetMonths(createdBudget.id, payload.months);
    }
    setSelectedCategorySetId(createdBudget.id);
    await refreshCategorySets(createdBudget.id);
    await refreshCategories(createdBudget.id);
  }

  async function handleRenameCategorySet(categorySetId: string, name: string) {
    await updateBudget(categorySetId, { name });
    await refreshCategorySets();
  }

  async function handleDuplicateCategorySet(categorySetId: string) {
    const duplicated = await duplicateBudget(categorySetId);
    const duplicatedSetId = (duplicated.budget || duplicated.categorySet)?.id;
    if (!duplicatedSetId) {
      throw new Error('Failed to duplicate budget.');
    }
    await refreshCategorySets(duplicatedSetId);
    await refreshCategories(duplicatedSetId);
  }

  async function handleSetDefaultCategorySet(categorySetId: string) {
    await updateBudget(categorySetId, { isDefault: true });
    await refreshCategorySets();
  }

  async function handleArchiveCategorySet(categorySetId: string) {
    await updateBudget(categorySetId, { status: 'archived' });
    await refreshCategorySets();
    await refreshCategories(null);
  }

  async function handleRestoreCategorySet(categorySetId: string) {
    await updateBudget(categorySetId, { status: 'active' });
    await refreshCategorySets(categorySetId);
    await refreshCategories(categorySetId);
  }

  async function handleDeleteCategorySet(categorySetId: string) {
    await deleteBudget(categorySetId);
    await refreshCategorySets();
    await refreshCategories(null);
  }

  async function handleAssignMonths(categorySetId: string, months: string[]) {
    await assignBudgetMonths(categorySetId, months);
    await refreshCategorySets();
  }

  async function handleUnassignMonths(categorySetId: string, months: string[]) {
    await unassignBudgetMonths(categorySetId, months);
    await refreshCategorySets();
  }

  async function handleCreateBudgetWithCategories(payload: {
    name: string;
    isDefault: boolean;
    startMonthKey: string | null;
    incomeCategories: Array<{ name: string; budget: number }>;
    expenseCategories: Array<{ name: string; budget: number }>;
  }) {
    // If this new budget will be the default, unset the current default first
    if (payload.isDefault) {
      const currentDefault = categorySets.find((b) => b.isDefault);
      if (currentDefault) {
        await updateBudget(currentDefault.id, { isDefault: false });
      }
    }

    const created = await createBudget({ name: payload.name, isDefault: payload.isDefault });
    const createdBudget = created.budget || created.categorySet;
    if (!createdBudget) {
      throw new Error('Failed to create budget.');
    }

    if (payload.startMonthKey) {
      await assignBudgetMonths(createdBudget.id, [payload.startMonthKey]);
    }

    const allCategories = [
      ...payload.incomeCategories.map((c) => ({ ...c, categoryType: 'income' as const })),
      ...payload.expenseCategories.map((c) => ({ ...c, categoryType: 'expense' as const })),
    ];

    await Promise.all(
      allCategories.map((c) =>
        createCategory({
          budgetId: createdBudget.id,
          name: c.name,
          description: null,
          budget: c.budget,
          categoryType: c.categoryType,
        }),
      ),
    );

    setSelectedCategorySetId(createdBudget.id);
    await refreshCategorySets(createdBudget.id);
    await refreshCategories(createdBudget.id);
  }

  async function handleEditBudgetWithCategories(
    budgetId: string,
    payload: {
      name: string;
      incomeCategories: Array<{ id?: string; name: string; budget: number }>;
      expenseCategories: Array<{ id?: string; name: string; budget: number }>;
      deletedCategoryIds: string[];
    },
  ) {
    await updateBudget(budgetId, { name: payload.name });

    // Delete removed categories
    await Promise.all(payload.deletedCategoryIds.map((id) => deleteCategory(id)));

    const allCategories = [
      ...payload.incomeCategories.map((c) => ({ ...c, categoryType: 'income' as const })),
      ...payload.expenseCategories.map((c) => ({ ...c, categoryType: 'expense' as const })),
    ];

    await Promise.all(
      allCategories.map((c) => {
        if (c.id) {
          return updateCategory(c.id, { name: c.name, budget: c.budget, categoryType: c.categoryType });
        }
        return createCategory({
          budgetId,
          name: c.name,
          description: null,
          budget: c.budget,
          categoryType: c.categoryType,
        });
      }),
    );

    await refreshCategorySets(budgetId);
    await refreshCategories(budgetId);
  }

  if (!currentUser) {
    return (
      <AuthView
        loading={authLoading}
        error={authError}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onRequestPasswordReset={handleRequestPasswordReset}
        onResetPassword={handleResetPassword}
      />
    );
  }

  const currentView = (() => {
    if (activeView === 'categories') {
      return (
        <CategoriesView
          categories={categoriesWithActual}
          categorySets={categorySets}
          selectedCategorySetId={selectedCategorySetId}
          monthAssignments={categorySetAssignments}
          assignmentMonthOptions={assignmentMonthOptions}
          categoriesLoading={categoriesLoading}
          generatingSuggestions={generatingSuggestions}
          onSelectCategorySet={setSelectedCategorySetId}
          onCreateCategorySet={(payload) => {
            void handleCreateCategorySet(payload);
          }}
          onAssignMonths={(categorySetId, months) => {
            void handleAssignMonths(categorySetId, months);
          }}
          onUnassignMonths={(categorySetId, months) => {
            void handleUnassignMonths(categorySetId, months);
          }}
          onGenerateSuggestions={() => {
            if (!selectedCategorySetId) {
              return;
            }
            void (async () => {
              try {
                setGeneratingSuggestions(true);
                await generateAiCategories({ budgetId: selectedCategorySetId });
                await refreshCategories(selectedCategorySetId);
              } catch (error) {
                setPlaidStatus(
                  error instanceof Error ? error.message : 'Failed to generate AI categories.',
                );
              } finally {
                setGeneratingSuggestions(false);
              }
            })();
          }}
          onAdd={() => {
            setEditingCategory(null);
            setFormOpen(true);
          }}
          onEdit={(category) => {
            setEditingCategory(category);
            setFormOpen(true);
          }}
          onDelete={(categoryId) => {
            void (async () => {
              await deleteCategory(categoryId);
              await refreshCategories(selectedCategorySetId);
            })();
          }}
          onCreateBudgetWithCategories={(p) => {
            void handleCreateBudgetWithCategories(p);
          }}
          onEditBudgetWithCategories={(budgetId, p) => {
            void handleEditBudgetWithCategories(budgetId, p);
          }}
          onGetBudgetCategories={async (budgetId) => {
            const response = await fetchCategories(budgetId);
            return response.activeCategories || [];
          }}
          onGetIncomeCategorySuggestions={async (query) => {
            const response = await fetchCategorySuggestions({
              categoryType: 'income',
              query: query || undefined,
              limit: 25,
            });
            return response.suggestions || [];
          }}
          onCreateCustomIncomeCategory={async (name) => {
            const response = await createCustomCategorySuggestion({
              name,
              categoryType: 'income',
            });
            return response.suggestion;
          }}
          onGetExpenseCategorySuggestions={async (query) => {
            const response = await fetchCategorySuggestions({
              categoryType: 'expense',
              query: query || undefined,
              limit: 25,
            });
            return response.suggestions || [];
          }}
          onCreateCustomExpenseCategory={async (name) => {
            const response = await createCustomCategorySuggestion({
              name,
              categoryType: 'expense',
            });
            return response.suggestion;
          }}
        />
      );
    }

    if (activeView === 'performance') {
      return (
        <PerformanceView
          categories={categoriesWithActual}
          transactions={transactions}
          focusCategoryAnalysisNonce={focusPerformanceCategoryAnalysisNonce}
        />
      );
    }

    if (activeView === 'transactions') {
      return (
        <TransactionsView
          categories={categories}
          accounts={manualAccounts}
          transactions={transactions}
          loading={plaidLoading}
          manualTransactionModalOpen={manualTransactionModalOpen}
          onCloseManualTransactionModal={() => setManualTransactionModalOpen(false)}
          onCreateManualTransaction={async (payload) => {
            try {
              await createManualTransaction(payload);
              await refreshPlaidState();
              setManualTransactionModalOpen(false);
              setPlaidStatus('Manual transaction added.');
            } catch (error) {
              setPlaidStatus(
                error instanceof Error ? error.message : 'Failed to add manual transaction.',
              );
              throw error;
            }
          }}
          onDeleteManualTransaction={async (transactionId) => {
            try {
              await deleteManualTransaction(transactionId);
              await refreshPlaidState();
              setPlaidStatus('Manual transaction removed.');
            } catch (error) {
              setPlaidStatus(
                error instanceof Error ? error.message : 'Failed to remove manual transaction.',
              );
              throw error;
            }
          }}
          onCategorizeTransactions={() =>
            withPlaidAction(async () => {
              setPlaidStatus('Categorizing transactions...');
              const result = await categorizeTransactions();
              const summaryText =
                result.categorization.skippedReason ||
                `Categorized ${result.categorization.categorizedCount} transactions.`;
              setPlaidStatus(summaryText);
            })
          }
          onChangeTransactionCategory={async (transactionId, categoryId, ignored = false) => {
            try {
              await overrideTransactionCategory(transactionId, categoryId, ignored);
              await refreshPlaidState();
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Failed to update the transaction category.';
              setPlaidStatus(message);
              throw error;
            }
          }}
        />
      );
    }

    if (activeView === 'upload') {
      return <UploadDataView categories={categories} onDataImported={refreshPlaidState} />;
    }

    if (activeView === 'settings') {
      return (
        <SettingsView
          accountCount={accountCount}
          linkedItems={linkedItems}
          plaidLoading={plaidLoading}
          onConnectPlaid={() =>
            withPlaidAction(async () => {
              setPlaidStatus('Linking account and running initial sync...');
              const result = await launchPlaidLink();
              setPlaidStatus(
                `Account linked successfully. Added ${result.initial_sync.transactions_added} transactions.`,
              );
            })
          }
        />
      );
    }

    return (
      <DashboardView
        summary={summary}
        categories={dashboardCategories}
        transactions={filteredDashboardTransactions}
        filterProps={{
          timePreset: dashboardTimePreset,
          onTimePresetChange: setDashboardTimePreset,
          selectedMonths: dashboardSelectedMonths,
          onSelectedMonthsChange: setDashboardSelectedMonths,
          selectedYear: dashboardYear,
          onSelectedYearChange: setDashboardYear,
          monthOptions,
          yearOptions,
          accountOptions,
          selectedAccount: dashboardAccount,
          onSelectedAccountChange: setDashboardAccount,
          categoryOptions,
          selectedCategory: dashboardCategory,
          onSelectedCategoryChange: setDashboardCategory,
          transactionType: dashboardTransactionType,
          onTransactionTypeChange: setDashboardTransactionType,
          periodLabel: dashboardRange.label,
        }}
        onOpenTransactions={() => setActiveView('transactions')}
        onOpenPerformanceCategoryAnalysis={() => {
          setActiveView('performance');
          setFocusPerformanceCategoryAnalysisNonce((current) => current + 1);
        }}
      />
    );
  })();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] lg:grid lg:grid-cols-[246px_minmax(0,1fr)]">
      <MobileNavDrawer
        open={mobileNavOpen}
        activeView={activeView}
        onClose={() => setMobileNavOpen(false)}
        onSelectView={setActiveView}
        onSignOut={handleSignOut}
      />
      <Sidebar activeView={activeView} onSelect={setActiveView} />

      <div className="min-w-0">
        <TopNav
          onSignOut={handleSignOut}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onAddTransaction={() => {
            setActiveView('transactions');
            setManualTransactionModalOpen(true);
          }}
        />

        <main className="min-w-0 px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-5">
          <div className="mx-auto w-full max-w-[1320px]">{currentView}</div>
        </main>
      </div>

      <CategoryForm
        open={formOpen}
        initialCategory={editingCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingCategory(null);
        }}
        onSave={handleSaveCategory}
      />

      <AskChiizChat
        monthKey={askChiizMonthKey}
        selectedAccountId={dashboardAccount}
        transactions={transactions}
        onAsk={async (payload) => {
          try {
            return await askChiiz(payload);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to ask Chiiz.';
            setPlaidStatus(message);
            throw error;
          }
        }}
      />
    </div>
  );
}

export default App;
