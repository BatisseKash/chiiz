import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Category, PlaidTransaction } from '../types';
import { Button } from './Button';
import { Card } from './Card';

type ReviewTab = 'needs_review' | 'confirmed';

type TransactionsTableProps = {
  transactions: PlaidTransaction[];
  categories: Category[];
  onChangeCategory: (
    transactionId: string,
    categoryId: string | null,
    ignored?: boolean,
  ) => Promise<void>;
  loading: boolean;
  onCategorizeTransactions: () => void;
  categoryTypeFilter: 'all' | 'expense' | 'income';
  onCategoryTypeFilterChange: (value: 'all' | 'expense' | 'income') => void;
  availableCategoryFilterIds: string[];
  showIgnoreFilterOption: boolean;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  monthOptions: Array<{ value: string; label: string }>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  activeTab: ReviewTab;
  onActiveTabChange: (tab: ReviewTab) => void;
  reviewCount: number;
  confirmedCount: number;
  totalThisMonth: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onDeleteManualTransaction: (transactionId: string) => Promise<void>;
};

const IGNORE_OPTION_VALUE = '__ignore__';
const IGNORE_OPTION_LABEL = 'Transfers / Ignore';

const merchantName = (transaction: PlaidTransaction) =>
  transaction.name || transaction.merchant_name || 'Unknown merchant';

const formatTransactionAmount = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const toTransactionKey = (transaction: PlaidTransaction) => transaction.id || transaction.transaction_id;
const isManualTransaction = (transaction: PlaidTransaction) =>
  String(transaction.transaction_id || '').startsWith('manual_');

function monthLabel(monthFilter: string, monthOptions: Array<{ value: string; label: string }>) {
  if (!monthFilter) {
    return 'No month selected';
  }
  return monthOptions.find((option) => option.value === monthFilter)?.label || monthFilter;
}

function selectionToCategoryName(
  selectionValue: string,
  categoryNameById: Map<string, string>,
  fallbackCategoryName?: string | null,
) {
  if (selectionValue === IGNORE_OPTION_VALUE) {
    return IGNORE_OPTION_LABEL;
  }
  if (!selectionValue) {
    return 'Needs Review';
  }
  return categoryNameById.get(selectionValue) || fallbackCategoryName || 'Needs Review';
}

function pageNumbers(currentPage: number, totalPages: number) {
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) {
      pages.add(page);
    }
  }
  return [...pages].sort((left, right) => left - right);
}

export function TransactionsTable({
  transactions,
  categories,
  onChangeCategory,
  loading,
  onCategorizeTransactions,
  categoryTypeFilter,
  onCategoryTypeFilterChange,
  availableCategoryFilterIds,
  showIgnoreFilterOption,
  categoryFilter,
  onCategoryFilterChange,
  monthFilter,
  onMonthFilterChange,
  monthOptions,
  searchQuery,
  onSearchQueryChange,
  activeTab,
  onActiveTabChange,
  reviewCount,
  confirmedCount,
  totalThisMonth,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onDeleteManualTransaction,
}: TransactionsTableProps) {
  const [selectedCategoryByTransaction, setSelectedCategoryByTransaction] = useState<
    Record<string, string>
  >({});
  const [confirmingIds, setConfirmingIds] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categories]);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.categoryType === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((category) => category.categoryType === 'income'),
    [categories],
  );
  const filterableCategories = useMemo(() => {
    if (categoryTypeFilter === 'expense') {
      return expenseCategories;
    }
    if (categoryTypeFilter === 'income') {
      return incomeCategories;
    }
    return categories;
  }, [categories, categoryTypeFilter, expenseCategories, incomeCategories]);

  const availableCategoryFilterSet = useMemo(
    () => new Set(availableCategoryFilterIds),
    [availableCategoryFilterIds],
  );
  const filterDropdownCategories = useMemo(
    () => filterableCategories.filter((category) => availableCategoryFilterSet.has(category.id)),
    [availableCategoryFilterSet, filterableCategories],
  );

  useEffect(() => {
    setSelectedCategoryByTransaction((current) => {
      const next = { ...current };
      for (const transaction of transactions) {
        const key = toTransactionKey(transaction);
        const selected = next[key];
        if (selected) {
          continue;
        }
        if (transaction.ignored_from_budget) {
          next[key] = IGNORE_OPTION_VALUE;
        } else if (transaction.category_id) {
          next[key] = transaction.category_id;
        }
      }
      return next;
    });
  }, [transactions]);

  const getEffectiveSelectionValue = (transaction: PlaidTransaction) => {
    const key = toTransactionKey(transaction);
    if (transaction.ignored_from_budget) {
      return IGNORE_OPTION_VALUE;
    }
    return selectedCategoryByTransaction[key] ?? transaction.category_id ?? '';
  };

  const applyTableFilters = (rows: PlaidTransaction[]) => {
    const query = searchQuery.trim().toLowerCase();
    const selectedCategory = categoryFilter;

    return rows.filter((transaction) => {
      const effectiveCategoryId = getEffectiveSelectionValue(transaction);
      if (selectedCategory !== 'all' && effectiveCategoryId !== selectedCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      const categoryName = selectionToCategoryName(
        effectiveCategoryId,
        categoryNameById,
        transaction.category_name,
      );
      const haystack = [
        merchantName(transaction),
        transaction.transaction_name,
        transaction.merchant_name,
        transaction.institution_name,
        transaction.account_name,
        transaction.account_type,
        transaction.date,
        categoryName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  };

  const visibleTransactions = useMemo(
    () => applyTableFilters(transactions),
    [transactions, searchQuery, categoryFilter, selectedCategoryByTransaction, categories],
  );

  const renderCategoryOptions = () => (
    <>
      <option value="">Needs Review</option>
      <option value={IGNORE_OPTION_VALUE}>{IGNORE_OPTION_LABEL}</option>
      {expenseCategories.length > 0 ? (
        <optgroup label="Expenses">
          {expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {'\u00A0\u00A0'}
              {category.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {incomeCategories.length > 0 ? (
        <optgroup label="Incomes">
          {incomeCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {'\u00A0\u00A0'}
              {category.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );

  const handleConfirmTransaction = async (transaction: PlaidTransaction) => {
    const key = toTransactionKey(transaction);
    const nextSelectionValue = getEffectiveSelectionValue(transaction);
    if (!nextSelectionValue) {
      return;
    }

    setConfirmingIds((current) => ({ ...current, [key]: true }));

    try {
      if (nextSelectionValue === IGNORE_OPTION_VALUE) {
        await onChangeCategory(transaction.id, null, true);
      } else {
        await onChangeCategory(transaction.id, nextSelectionValue, false);
      }
    } finally {
      setConfirmingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const handleDeleteManualTransaction = async (transaction: PlaidTransaction) => {
    if (!isManualTransaction(transaction)) {
      return;
    }
    const key = toTransactionKey(transaction);
    setDeletingIds((current) => ({ ...current, [key]: true }));
    try {
      await onDeleteManualTransaction(transaction.id);
    } finally {
      setDeletingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const renderReviewRows = (rows: PlaidTransaction[]) => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
            No transactions need review for this month.
          </td>
        </tr>
      );
    }

    return rows.map((transaction) => {
      const amount = Number(transaction.amount || 0);
      const isCredit = amount < 0;
      const key = toTransactionKey(transaction);
      const selectedCategoryValue = getEffectiveSelectionValue(transaction);
      const confirmDisabled = !selectedCategoryValue || confirmingIds[key];
      const manual = isManualTransaction(transaction);
      const deleting = Boolean(deletingIds[key]);

      return (
        <tr key={transaction.transaction_id} className="transition-colors hover:bg-[var(--color-surface-alt)]">
          <td className="px-4 py-3.5">
            <p className="font-medium text-[var(--color-text-primary)]">{merchantName(transaction)}</p>
            {transaction.categorization_reason ? (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{transaction.categorization_reason}</p>
            ) : null}
          </td>
          <td className="px-4 py-3.5">
            <div className="min-w-[160px]">
              <p className="font-medium text-[var(--color-text-primary)]">
                {transaction.institution_name || 'Linked institution'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {[transaction.account_name, transaction.account_type].filter(Boolean).join(' · ') ||
                  'Account unavailable'}
              </p>
            </div>
          </td>
          <td className="px-4 py-3.5">
            <div className="min-w-[200px] space-y-2">
              <select
                value={selectedCategoryValue}
                onChange={(event) =>
                  setSelectedCategoryByTransaction((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
              >
                {renderCategoryOptions()}
              </select>
            </div>
          </td>
          <td className="px-4 py-3.5 text-sm text-[var(--color-text-secondary)]">{transaction.date}</td>
          <td
            className={`px-4 py-3.5 text-sm font-semibold ${
              isCredit ? 'text-[var(--color-positive)]' : 'text-[var(--color-text-primary)]'
            }`}
          >
            {isCredit ? '+' : ''}
            {formatTransactionAmount(Math.abs(amount))}
          </td>
          <td className="px-4 py-3.5 text-right">
            <div className="flex items-center justify-end gap-2">
              {manual ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    void handleDeleteManualTransaction(transaction);
                  }}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {deleting ? 'Removing...' : 'Remove'}
                </button>
              ) : null}
              <Button
                variant="primary"
                disabled={confirmDisabled || deleting}
                onClick={() => {
                  void handleConfirmTransaction(transaction);
                }}
                className="px-3 py-1.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                {confirmingIds[key] ? 'Confirming...' : 'Confirm'}
              </Button>
            </div>
          </td>
        </tr>
      );
    });
  };

  const renderConfirmedRows = (rows: PlaidTransaction[]) => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
            No confirmed transactions for this month.
          </td>
        </tr>
      );
    }

    return rows.map((transaction) => {
      const amount = Number(transaction.amount || 0);
      const isCredit = amount < 0;
      const key = toTransactionKey(transaction);
      const selectionValue = getEffectiveSelectionValue(transaction);
      const manual = isManualTransaction(transaction);
      const deleting = Boolean(deletingIds[key]);

      return (
        <tr key={transaction.transaction_id} className="transition-colors hover:bg-[var(--color-surface-alt)]">
          <td className="px-4 py-3.5">
            <p className="font-medium text-[var(--color-text-primary)]">{merchantName(transaction)}</p>
            {transaction.categorization_reason ? (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{transaction.categorization_reason}</p>
            ) : null}
          </td>
          <td className="px-4 py-3.5">
            <div className="min-w-[160px]">
              <p className="font-medium text-[var(--color-text-primary)]">
                {transaction.institution_name || 'Linked institution'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {[transaction.account_name, transaction.account_type].filter(Boolean).join(' · ') ||
                  'Account unavailable'}
              </p>
            </div>
          </td>
          <td className="px-4 py-3.5">
            <div className="min-w-[200px]">
              <select
                value={selectionValue}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedCategoryByTransaction((current) => ({
                    ...current,
                    [key]: value,
                  }));
                  void onChangeCategory(
                    transaction.id,
                    value && value !== IGNORE_OPTION_VALUE ? value : null,
                    value === IGNORE_OPTION_VALUE,
                  );
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
              >
                {renderCategoryOptions()}
              </select>
            </div>
          </td>
          <td className="px-4 py-3.5 text-sm text-[var(--color-text-secondary)]">{transaction.date}</td>
          <td
            className={`px-4 py-3.5 text-sm font-semibold ${
              isCredit ? 'text-[var(--color-positive)]' : 'text-[var(--color-text-primary)]'
            }`}
          >
            {isCredit ? '+' : ''}
            {formatTransactionAmount(Math.abs(amount))}
          </td>
          <td className="px-4 py-3.5 text-right">
            <div className="flex items-center justify-end gap-2">
              {manual ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    void handleDeleteManualTransaction(transaction);
                  }}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {deleting ? 'Removing...' : 'Remove'}
                </button>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-positive-soft)] bg-[var(--color-positive-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-positive)]">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                Confirmed
              </span>
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <Card className="space-y-5">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            Transactions
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            Transaction feed
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            Review, filter, and categorize your synced transactions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:w-auto">
            <Filter className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.5} />
            <select
              value={monthFilter}
              onChange={(event) => onMonthFilterChange(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none sm:min-w-[180px]"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:w-auto">
            <Filter className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.5} />
            <select
              value={categoryTypeFilter}
              onChange={(event) =>
                onCategoryTypeFilterChange(event.target.value as 'all' | 'expense' | 'income')
              }
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none sm:min-w-[170px]"
            >
              <option value="all">All category types</option>
              <option value="expense">Expense categories</option>
              <option value="income">Income categories</option>
            </select>
          </label>

          <label className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:w-auto">
            <Filter className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.5} />
            <select
              value={categoryFilter}
              onChange={(event) => onCategoryFilterChange(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none sm:min-w-[200px]"
            >
              <option value="all">All categories</option>
              {showIgnoreFilterOption ? (
                <option value={IGNORE_OPTION_VALUE}>{IGNORE_OPTION_LABEL}</option>
              ) : null}
              {filterDropdownCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:w-auto">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.5} />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search transactions..."
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] sm:min-w-[220px]"
            />
          </label>

          <span className="w-full text-sm text-[var(--color-text-muted)] sm:w-auto">
            {totalThisMonth} transaction{totalThisMonth === 1 ? '' : 's'} in {monthLabel(monthFilter, monthOptions)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onActiveTabChange('needs_review')}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                activeTab === 'needs_review'
                  ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Clock3 className="h-4 w-4" strokeWidth={1.8} />
              Needs review
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {reviewCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onActiveTabChange('confirmed')}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                activeTab === 'confirmed'
                  ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
              Confirmed transactions
              <span className="rounded-full bg-[var(--color-positive-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-positive)]">
                {confirmedCount}
              </span>
            </button>
          </div>
        </div>

        {activeTab === 'needs_review' ? (
          <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Choose a category, then confirm to move the transaction to Confirmed transactions.
          </div>
        ) : null}
      </div>

      <div className="-mx-4 hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] sm:mx-0 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead className="bg-[var(--color-surface-alt)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  Merchant
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
                  {activeTab === 'needs_review' ? 'Action' : 'Status'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)] text-sm">
              {activeTab === 'needs_review'
                ? renderReviewRows(visibleTransactions)
                : renderConfirmedRows(visibleTransactions)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {visibleTransactions.map((transaction) => {
            const amount = Number(transaction.amount || 0);
            const isCredit = amount < 0;
            const accountMeta =
              [transaction.account_name, transaction.account_type].filter(Boolean).join(' · ') ||
              'Account unavailable';
            const key = toTransactionKey(transaction);
            const selectedCategoryValue = getEffectiveSelectionValue(transaction);
            const manual = isManualTransaction(transaction);
            const deleting = Boolean(deletingIds[key]);

            return (
              <article
                key={transaction.transaction_id}
                className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="border-b border-[var(--color-border)] px-4 py-4">
                  <p className="text-[18px] font-bold leading-tight text-[var(--color-text-primary)]">
                    {merchantName(transaction)}
                  </p>
                  {transaction.categorization_reason ? (
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {transaction.categorization_reason}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">
                    {transaction.date}
                    <span className="mx-2">•</span>
                    {transaction.institution_name || 'Linked institution'}
                  </p>
                  <p
                    className={`mt-2 text-[22px] font-extrabold leading-tight ${
                      isCredit ? 'text-[var(--color-positive)]' : 'text-[var(--color-text-primary)]'
                    }`}
                  >
                    {isCredit ? '+' : ''}
                    {formatTransactionAmount(Math.abs(amount))}
                  </p>
                </div>

                <div className="space-y-4 px-4 py-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                      Account
                    </p>
                    <div className="mt-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3">
                      <p className="text-[16px] font-bold leading-tight text-[var(--color-text-primary)]">
                        {transaction.institution_name || 'Linked institution'}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{accountMeta}</p>
                    </div>
                  </div>

                  {activeTab === 'needs_review' ? (
                    <>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                          Category
                        </p>
                        <select
                          value={selectedCategoryValue}
                          onChange={(event) =>
                            setSelectedCategoryByTransaction((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          className="mt-2 h-12 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-base font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                        >
                          {renderCategoryOptions()}
                        </select>
                      </div>

                      <Button
                        variant="primary"
                        className="w-full justify-center"
                        disabled={!selectedCategoryValue || confirmingIds[key] || deleting}
                        onClick={() => {
                          void handleConfirmTransaction(transaction);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
                        {confirmingIds[key] ? 'Confirming...' : 'Confirm Transaction'}
                      </Button>
                      {manual ? (
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => {
                            void handleDeleteManualTransaction(transaction);
                          }}
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                          {deleting ? 'Removing...' : 'Remove Transaction'}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        Category
                      </p>
                      <select
                        value={selectedCategoryValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedCategoryByTransaction((current) => ({
                            ...current,
                            [key]: value,
                          }));
                          void onChangeCategory(
                            transaction.id,
                            value && value !== IGNORE_OPTION_VALUE ? value : null,
                            value === IGNORE_OPTION_VALUE,
                          );
                        }}
                        className="mt-2 h-12 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-base font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                      >
                        {renderCategoryOptions()}
                      </select>
                      {manual ? (
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => {
                            void handleDeleteManualTransaction(transaction);
                          }}
                          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                          {deleting ? 'Removing...' : 'Remove Transaction'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })}

        {visibleTransactions.length === 0 ? (
          <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
            {activeTab === 'needs_review'
              ? 'No transactions need review for this month.'
              : 'No confirmed transactions for this month.'}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Showing{' '}
          <span className="font-semibold text-[var(--color-text-primary)]">
            {Math.max(0, (activeTab === 'needs_review' ? reviewCount : confirmedCount) === 0 ? 0 : (page - 1) * pageSize + 1)}
            –
            {Math.min(
              activeTab === 'needs_review' ? reviewCount : confirmedCount,
              page * pageSize,
            )}
          </span>{' '}
          of{' '}
          <span className="font-semibold text-[var(--color-text-primary)]">
            {activeTab === 'needs_review' ? reviewCount : confirmedCount}
          </span>{' '}
          transactions
        </p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
          </button>
          {pageNumbers(page, totalPages).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-[var(--radius-sm)] border px-3 text-sm font-semibold ${
                pageNumber === page
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
              }`}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          Rows per page:
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] outline-none"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
