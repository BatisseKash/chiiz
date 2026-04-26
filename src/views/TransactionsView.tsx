import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { TransactionsTable } from '../components/TransactionsTable';
import { fetchTransactions } from '../lib/api';
import type { Category, LinkedAccount, PlaidTransaction } from '../types';

type ReviewTab = 'needs_review' | 'confirmed';
const TRANSACTIONS_FILTERS_STORAGE_KEY = 'chiiz.transactions.filters.v1';

type StoredTransactionsFilters = {
  activeTab?: ReviewTab;
  rowsPerPage?: number;
  categoryTypeFilter?: 'all' | 'expense' | 'income';
  categoryFilter?: string;
  monthFilter?: string;
  searchQuery?: string;
};

function readStoredTransactionsFilters(): StoredTransactionsFilters {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(TRANSACTIONS_FILTERS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as StoredTransactionsFilters;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type TransactionsViewProps = {
  categories: Category[];
  accounts: LinkedAccount[];
  transactions: PlaidTransaction[];
  loading: boolean;
  manualTransactionModalOpen: boolean;
  onCloseManualTransactionModal: () => void;
  onCreateManualTransaction: (payload: {
    merchant: string;
    accountId: string;
    transactionType: 'income' | 'expense';
    categoryId?: string | null;
    date: string;
    amount: number;
  }) => Promise<void>;
  onDeleteManualTransaction: (transactionId: string) => Promise<void>;
  onCategorizeTransactions: () => void;
  onChangeTransactionCategory: (
    transactionId: string,
    categoryId: string | null,
    ignored?: boolean,
  ) => Promise<void>;
};

export function TransactionsView({
  categories,
  accounts,
  transactions,
  loading,
  manualTransactionModalOpen,
  onCloseManualTransactionModal,
  onCreateManualTransaction,
  onDeleteManualTransaction,
  onCategorizeTransactions,
  onChangeTransactionCategory,
}: TransactionsViewProps) {
  const storedFilters = readStoredTransactionsFilters();
  const isConfirmedTransaction = (transaction: PlaidTransaction) => {
    const source = String(transaction.categorization_source || '').toLowerCase();
    const sourceIsConfirmed =
      source === 'user' || source === 'rule' || source === 'mapped' || source === 'ai';
    return Boolean(transaction.ignored_from_budget) || Boolean(transaction.category_id) || sourceIsConfirmed;
  };

  const [activeTab, setActiveTab] = useState<ReviewTab>(
    storedFilters.activeTab === 'confirmed' ? 'confirmed' : 'needs_review',
  );
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    [10, 25, 50, 100].includes(Number(storedFilters.rowsPerPage))
      ? Number(storedFilters.rowsPerPage)
      : 25,
  );
  const [pageByTab, setPageByTab] = useState<Record<ReviewTab, number>>({
    needs_review: 1,
    confirmed: 1,
  });
  const [pagedTransactions, setPagedTransactions] = useState<PlaidTransaction[]>([]);
  const [totalPagesByTab, setTotalPagesByTab] = useState<Record<ReviewTab, number>>({
    needs_review: 1,
    confirmed: 1,
  });
  const [counts, setCounts] = useState<{ needs_review: number; confirmed: number; total: number }>({
    needs_review: 0,
    confirmed: 0,
    total: 0,
  });
  const [tableLoading, setTableLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<'all' | 'expense' | 'income'>(
    storedFilters.categoryTypeFilter === 'expense' || storedFilters.categoryTypeFilter === 'income'
      ? storedFilters.categoryTypeFilter
      : 'all',
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(
    typeof storedFilters.categoryFilter === 'string' && storedFilters.categoryFilter.trim()
      ? storedFilters.categoryFilter
      : 'all',
  );
  const [monthFilter, setMonthFilter] = useState<string>(
    typeof storedFilters.monthFilter === 'string' ? storedFilters.monthFilter : '',
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    typeof storedFilters.searchQuery === 'string' ? storedFilters.searchQuery : '',
  );
  const [merchant, setMerchant] = useState('');
  const [accountId, setAccountId] = useState('cash');
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const manualCategoryOptions = useMemo(
    () => categories.filter((category) => category.categoryType === transactionType),
    [categories, transactionType],
  );

  useEffect(() => {
    if (!categoryId) {
      return;
    }
    if (!manualCategoryOptions.some((category) => category.id === categoryId)) {
      setCategoryId('');
    }
  }, [categoryId, manualCategoryOptions]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const transaction of transactions) {
      const month = String(transaction.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        keys.add(month);
      }
    }
    return [...keys]
      .sort((left, right) => (left > right ? -1 : 1))
      .map((value) => {
        const [year, month] = value.split('-').map(Number);
        const dateValue = new Date(year, month - 1, 1);
        return {
          value,
          label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
            dateValue,
          ),
        };
      });
  }, [transactions]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      setMonthFilter('');
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    setMonthFilter((previous) => {
      if (previous && monthOptions.some((option) => option.value === previous)) {
        return previous;
      }
      if (monthOptions.some((option) => option.value === currentMonth)) {
        return currentMonth;
      }
      return monthOptions[0].value;
    });
  }, [monthOptions]);

  useEffect(() => {
    setPageByTab({ needs_review: 1, confirmed: 1 });
  }, [monthFilter, rowsPerPage, categoryFilter, categoryTypeFilter]);

  useEffect(() => {
    if (categoryFilter === 'all') {
      return;
    }
    const selectedCategory = categories.find((category) => category.id === categoryFilter) || null;
    if (!selectedCategory) {
      setCategoryFilter('all');
      return;
    }
    if (categoryTypeFilter !== 'all' && selectedCategory.categoryType !== categoryTypeFilter) {
      setCategoryFilter('all');
    }
  }, [categories, categoryFilter, categoryTypeFilter]);

  const categoryTypeById = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>();
    for (const category of categories) {
      map.set(category.id, category.categoryType);
    }
    return map;
  }, [categories]);

  const availableFilterMeta = useMemo(() => {
    const availableCategoryIds = new Set<string>();
    let hasIgnoreOption = false;

    for (const transaction of transactions) {
      const transactionMonth = String(transaction.date || '').slice(0, 7);
      if (monthFilter && transactionMonth !== monthFilter) {
        continue;
      }

      const confirmed = isConfirmedTransaction(transaction);
      if (activeTab === 'confirmed' && !confirmed) {
        continue;
      }
      if (activeTab === 'needs_review' && confirmed) {
        continue;
      }

      const categoryId = transaction.category_id || '';
      const categoryType = categoryId
        ? categoryTypeById.get(categoryId) || null
        : Number(transaction.amount || 0) < 0
          ? 'income'
          : 'expense';
      if (
        categoryTypeFilter !== 'all' &&
        !transaction.ignored_from_budget &&
        categoryType !== categoryTypeFilter
      ) {
        continue;
      }

      if (transaction.ignored_from_budget) {
        hasIgnoreOption = true;
      }

      if (categoryId) {
        availableCategoryIds.add(categoryId);
      }
    }

    return {
      categoryIds: [...availableCategoryIds],
      hasIgnoreOption,
    };
  }, [activeTab, categoryTypeById, categoryTypeFilter, monthFilter, transactions]);

  useEffect(() => {
    if (categoryFilter === 'all') {
      return;
    }
    if (categoryFilter === '__ignore__' && availableFilterMeta.hasIgnoreOption) {
      return;
    }
    if (!availableFilterMeta.categoryIds.includes(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [availableFilterMeta, categoryFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload: StoredTransactionsFilters = {
      activeTab,
      rowsPerPage,
      categoryTypeFilter,
      categoryFilter,
      monthFilter,
      searchQuery,
    };
    window.sessionStorage.setItem(TRANSACTIONS_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [activeTab, rowsPerPage, categoryTypeFilter, categoryFilter, monthFilter, searchQuery]);

  useEffect(() => {
    if (!monthFilter) {
      setPagedTransactions([]);
      setCounts({ needs_review: 0, confirmed: 0, total: 0 });
      setTotalPagesByTab({ needs_review: 1, confirmed: 1 });
      return;
    }

    let cancelled = false;
    const currentPage = pageByTab[activeTab];

    void (async () => {
      try {
        setTableLoading(true);
        const response = await fetchTransactions({
          monthKey: monthFilter,
          page: currentPage,
          pageSize: rowsPerPage,
          reviewTab: activeTab,
          categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
          categoryType: categoryTypeFilter !== 'all' ? categoryTypeFilter : undefined,
        });
        if (cancelled) {
          return;
        }

        setPagedTransactions(response.transactions || []);
        if (response.counts) {
          setCounts(response.counts);
        }
        if (response.pagination) {
          setTotalPagesByTab((prev) => ({
            ...prev,
            [activeTab]: Math.max(1, response.pagination?.total_pages || 1),
          }));
          if (response.pagination.page !== currentPage) {
            setPageByTab((prev) => ({
              ...prev,
              [activeTab]: response.pagination?.page || 1,
            }));
          }
        }
      } finally {
        if (!cancelled) {
          setTableLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, monthFilter, pageByTab, reloadNonce, rowsPerPage, categoryFilter, categoryTypeFilter]);

  return (
    <div>
      <TransactionsTable
        transactions={pagedTransactions}
        categories={categories}
        onChangeCategory={async (transactionId, categoryId, ignored = false) => {
          await onChangeTransactionCategory(transactionId, categoryId, ignored);
          setReloadNonce((current) => current + 1);
        }}
        loading={loading || tableLoading}
        onCategorizeTransactions={onCategorizeTransactions}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categoryTypeFilter={categoryTypeFilter}
        onCategoryTypeFilterChange={setCategoryTypeFilter}
        availableCategoryFilterIds={availableFilterMeta.categoryIds}
        showIgnoreFilterOption={availableFilterMeta.hasIgnoreOption}
        monthFilter={monthFilter}
        onMonthFilterChange={setMonthFilter}
        monthOptions={monthOptions}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        reviewCount={counts.needs_review}
        confirmedCount={counts.confirmed}
        totalThisMonth={counts.total}
        page={pageByTab[activeTab]}
        totalPages={totalPagesByTab[activeTab]}
        pageSize={rowsPerPage}
        onPageChange={(nextPage) =>
          setPageByTab((current) => ({
            ...current,
            [activeTab]: Math.max(1, nextPage),
          }))
        }
        onPageSizeChange={setRowsPerPage}
        onDeleteManualTransaction={async (transactionId) => {
          await onDeleteManualTransaction(transactionId);
          setReloadNonce((current) => current + 1);
        }}
      />

      {manualTransactionModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-text-primary)]/28 p-4">
          <div className="w-full max-w-[460px] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="font-display text-[1.9rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Add Transaction
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Add a manual transaction and include it in your budget analysis.
              </p>
            </div>

            <form
              className="space-y-3 px-5 py-5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!merchant.trim() || !date || !amount) {
                  return;
                }
                setSavingManual(true);
                try {
                  await onCreateManualTransaction({
                    merchant: merchant.trim(),
                    accountId,
                    transactionType,
                    categoryId: categoryId || null,
                    date,
                    amount: Number(amount),
                  });
                  setMerchant('');
                  setAccountId('cash');
                  setTransactionType('expense');
                  setCategoryId('');
                  setAmount('');
                  setDate(new Date().toISOString().slice(0, 10));
                } finally {
                  setSavingManual(false);
                }
              }}
            >
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Merchant
                </span>
                <input
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                  placeholder="Coffee Shop"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Select Account
                </span>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                >
                  <option value="cash">Cash</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {(account.institution_name || 'Institution') + ' • ' + (account.account_name || 'Account')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Transaction Type
                </span>
                <select
                  value={transactionType}
                  onChange={(event) => setTransactionType(event.target.value as 'income' | 'expense')}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Category
                </span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                >
                  <option value="">Needs Review</option>
                  {manualCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Amount
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                    placeholder="25.50"
                    required
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onCloseManualTransactionModal}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={savingManual}>
                  {savingManual ? 'Saving...' : 'Save Transaction'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
