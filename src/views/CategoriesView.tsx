import { ChevronDown, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/Button';
import { formatCurrency } from '../lib/format';
import type { Budget, BudgetMonthAssignment, Category, CategorySuggestion } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function monthKeyLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function budgetPeriod(budgetId: string, assignments: BudgetMonthAssignment[]) {
  const months = assignments
    .filter((a) => a.budgetId === budgetId)
    .map((a) => a.monthKey)
    .sort();
  if (!months.length) return null;
  if (months.length === 1) return monthKeyLabel(months[0]);
  return `${monthKeyLabel(months[0])} – ${monthKeyLabel(months[months.length - 1])}`;
}

function budgetActiveSince(budgetId: string, assignments: BudgetMonthAssignment[], createdAt: string) {
  const months = assignments
    .filter((a) => a.budgetId === budgetId)
    .map((a) => a.monthKey)
    .sort();
  if (months.length) return monthKeyLabel(months[0]);
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? null : `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

function newRowId() {
  return Math.random().toString(36).slice(2);
}

// ─── types ─────────────────────────────────────────────────────────────────────

type MonthOption = { value: string; label: string };
type ModalRow = { uid: string; categoryId?: string; name: string; amount: string };
type EffDate = 'this' | 'next' | 'custom';

type CategoriesViewProps = {
  categories: Category[];
  categorySets: Budget[];
  selectedCategorySetId: string | null;
  monthAssignments: BudgetMonthAssignment[];
  assignmentMonthOptions: MonthOption[];
  categoriesLoading: boolean;
  generatingSuggestions: boolean;
  onSelectCategorySet: (id: string) => void;
  onCreateCategorySet: (payload: { name: string; isLatest: boolean; months: string[] }) => void;
  onAssignMonths: (budgetId: string, months: string[]) => void;
  onUnassignMonths: (budgetId: string, months: string[]) => void;
  onGenerateSuggestions: () => void;
  onAdd: () => void;
  onEdit: (category: Category) => void;
  onDelete: (categoryId: string) => void;
  onCreateBudgetWithCategories: (payload: {
    name: string;
    isDefault: boolean;
    startMonthKey: string | null;
    incomeCategories: Array<{ name: string; budget: number }>;
    expenseCategories: Array<{ name: string; budget: number }>;
  }) => void | Promise<void>;
  onEditBudgetWithCategories: (
    budgetId: string,
    payload: {
      name: string;
      incomeCategories: Array<{ id?: string; name: string; budget: number }>;
      expenseCategories: Array<{ id?: string; name: string; budget: number }>;
      deletedCategoryIds: string[];
    },
  ) => void | Promise<void>;
  onGetBudgetCategories: (budgetId: string) => Promise<Category[]>;
  onGetIncomeCategorySuggestions: (query: string) => Promise<CategorySuggestion[]>;
  onCreateCustomIncomeCategory: (name: string) => Promise<CategorySuggestion>;
  onGetExpenseCategorySuggestions: (query: string) => Promise<CategorySuggestion[]>;
  onCreateCustomExpenseCategory: (name: string) => Promise<CategorySuggestion>;
};

// ─── shared input style ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]';

type BudgetModalSectionProps = {
  type: 'income' | 'expense';
  rows: ModalRow[];
  total: number;
  label: string;
  totalLabel: string;
  onAddRow: (type: 'income' | 'expense') => void;
  onRemoveRow: (type: 'income' | 'expense', uid: string) => void;
  onUpdateRow: (
    type: 'income' | 'expense',
    uid: string,
    field: 'name' | 'amount',
    value: string,
  ) => void;
  suggestions: CategorySuggestion[];
  onCreateCustomCategory: (name: string) => Promise<CategorySuggestion>;
};

function scoreSuggestion(name: string, query: string) {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return 1;
  }
  if (normalizedName === normalizedQuery) {
    return 100;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 70;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 45;
  }
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let tokenHits = 0;
  for (const token of tokens) {
    if (normalizedName.includes(token)) {
      tokenHits += 1;
    }
  }
  return tokenHits ? 20 + tokenHits * 8 : 0;
}

type SearchableCategoryInputProps = {
  value: string;
  placeholder: string;
  suggestions: CategorySuggestion[];
  onChange: (value: string) => void;
  onCreateCustom: (name: string) => Promise<void>;
};

function SearchableCategoryInput({
  value,
  placeholder,
  suggestions,
  onChange,
  onCreateCustom,
}: SearchableCategoryInputProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const query = value.trim();
  const normalizedQuery = query.toLowerCase();
  const filtered = useMemo(() => {
    return [...suggestions]
      .map((suggestion) => ({ suggestion, score: scoreSuggestion(suggestion.name, value) }))
      .filter((entry) => (value.trim() ? entry.score > 0 : true))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.suggestion.isDefault !== right.suggestion.isDefault) {
          return left.suggestion.isDefault ? -1 : 1;
        }
        return left.suggestion.name.localeCompare(right.suggestion.name);
      })
      .slice(0, 8)
      .map((entry) => entry.suggestion);
  }, [suggestions, value]);

  const hasExactMatch = useMemo(
    () => suggestions.some((suggestion) => suggestion.name.toLowerCase() === normalizedQuery),
    [normalizedQuery, suggestions],
  );

  const canCreateCustom = Boolean(query) && !hasExactMatch;
  const totalItems = filtered.length + (canCreateCustom ? 1 : 0);

  useEffect(() => {
    setActiveIndex(totalItems > 0 ? 0 : -1);
  }, [query, open, totalItems]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePanelRect() {
      if (!inputRef.current) {
        return;
      }
      const rect = inputRef.current.getBoundingClientRect();
      setPanelRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePanelRect();
    window.addEventListener('resize', updatePanelRect);
    window.addEventListener('scroll', updatePanelRect, true);
    return () => {
      window.removeEventListener('resize', updatePanelRect);
      window.removeEventListener('scroll', updatePanelRect, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const targetNode = event.target instanceof Node ? event.target : null;
      if (!targetNode) {
        return;
      }
      if (!rootRef.current) {
        return;
      }
      const clickedInput = rootRef.current.contains(targetNode);
      const clickedPanel = panelRef.current?.contains(targetNode) || false;
      if (!clickedInput && !clickedPanel) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || activeIndex < 0 || !panelRef.current) {
      return;
    }
    const activeElement = panelRef.current.querySelector<HTMLElement>(
      `[data-suggestion-index="${activeIndex}"]`,
    );
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  async function handleCreateOptionClick(nextQuery: string) {
    setCreating(true);
    try {
      await onCreateCustom(nextQuery);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleEnterAction() {
    if (activeIndex < 0) {
      return;
    }
    if (activeIndex < filtered.length) {
      const suggestion = filtered[activeIndex];
      if (!suggestion) {
        return;
      }
      onChange(suggestion.name);
      setOpen(false);
      return;
    }

    if (canCreateCustom) {
      await handleCreateOptionClick(query);
    }
  }

  return (
    <div ref={rootRef} className="relative flex-[1.4]">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            setOpen(true);
            return;
          }

          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!totalItems) {
              return;
            }
            setActiveIndex((current) => (current + 1) % totalItems);
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!totalItems) {
              return;
            }
            setActiveIndex((current) => (current <= 0 ? totalItems - 1 : current - 1));
            return;
          }

          if (event.key === 'Enter' && open) {
            event.preventDefault();
            void handleEnterAction();
          }
        }}
        placeholder={placeholder}
        className={inputCls}
      />
      {open && panelRect
        ? createPortal(
            <div
              ref={panelRef}
              className="z-[70] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
              style={{
                position: 'fixed',
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
              }}
            >
              <div className="border-b border-[var(--color-border)] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Suggested categories
                </p>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                <div className="divide-y divide-[var(--color-border)]">
                  {filtered.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      data-suggestion-index={index}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        onChange(suggestion.name);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[15px] leading-5 text-[var(--color-text-primary)] transition ${
                        activeIndex === index
                          ? 'bg-[var(--color-accent-light)]/60'
                          : 'hover:bg-[var(--color-surface-alt)]'
                      }`}
                    >
                      <span className="font-medium">{suggestion.name}</span>
                      {suggestion.isDefault ? (
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                          Default
                        </span>
                      ) : null}
                    </button>
                  ))}

                  {canCreateCustom ? (
                    <button
                      type="button"
                      data-suggestion-index={filtered.length}
                      disabled={creating}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(filtered.length)}
                      onClick={() => {
                        void handleCreateOptionClick(query);
                      }}
                      className={`w-full px-4 py-3 text-left text-[15px] transition ${
                        activeIndex === filtered.length
                          ? 'bg-[var(--color-accent-light)]/60'
                          : 'hover:bg-[var(--color-surface-alt)]'
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <span className="text-[var(--color-text-secondary)]">Create custom category:</span>{' '}
                      <span className="font-semibold text-[var(--color-accent)]">{query}</span>
                    </button>
                  ) : null}
                </div>
                {!query && filtered.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[var(--color-text-muted)]">No suggestions yet.</p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function BudgetModalSection({
  type,
  rows,
  total,
  label,
  totalLabel,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  suggestions,
  onCreateCustomCategory,
}: BudgetModalSectionProps) {
  const isIncome = type === 'income';
  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)]">
      <div
        className={`flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5 ${
          isIncome ? 'bg-[#F0FDF9]' : 'bg-[#FEF2F2]'
        }`}
      >
        <div
          className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] ${
            isIncome ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
          }`}
        >
          {isIncome ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </svg>
          )}
          {label}
        </div>
        <button
          type="button"
          onClick={() => onAddRow(type)}
          className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)]"
        >
          + Add {type}
        </button>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-2 text-center text-xs text-[var(--color-text-muted)]">
            No {type} categories yet.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.uid} className="flex items-center gap-2">
              <SearchableCategoryInput
                value={row.name}
                placeholder={
                  isIncome
                    ? 'Search or create income category'
                    : 'Search or create expense category'
                }
                suggestions={suggestions}
                onChange={(next) => onUpdateRow(type, row.uid, 'name', next)}
                onCreateCustom={async (nextName) => {
                  const created = await onCreateCustomCategory(nextName);
                  onUpdateRow(type, row.uid, 'name', created.name);
                }}
              />
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => onUpdateRow(type, row.uid, 'amount', e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-6`}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveRow(type, row.uid)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[var(--color-negative)] hover:bg-red-50 hover:text-[var(--color-negative)]"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">
          {totalLabel}
        </span>
        <span
          className={`font-display text-sm font-bold ${
            isIncome ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
          }`}
        >
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export function CategoriesView({
  categories,
  categorySets,
  selectedCategorySetId,
  monthAssignments,
  assignmentMonthOptions,
  categoriesLoading,
  onSelectCategorySet,
  onCreateBudgetWithCategories,
  onEditBudgetWithCategories,
  onGetBudgetCategories,
  onGetIncomeCategorySuggestions,
  onCreateCustomIncomeCategory,
  onGetExpenseCategorySuggestions,
  onCreateCustomExpenseCategory,
}: CategoriesViewProps) {

  // ── derived budget lists ──────────────────────────────────────────────────
  const activeBudget = useMemo(
    () => categorySets.find((b) => b.isDefault) || categorySets[0] || null,
    [categorySets],
  );
  const pastBudgets = useMemo(
    () => categorySets.filter((b) => b.id !== activeBudget?.id),
    [categorySets, activeBudget],
  );

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.categoryType === 'income').sort((a, b) => b.budget - a.budget),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.categoryType === 'expense').sort((a, b) => b.budget - a.budget),
    [categories],
  );
  const totalIncome = useMemo(
    () => incomeCategories.reduce((s, c) => s + c.budget, 0),
    [incomeCategories],
  );
  const totalExpenses = useMemo(
    () => expenseCategories.reduce((s, c) => s + c.budget, 0),
    [expenseCategories],
  );
  const plannedSavings = totalIncome - totalExpenses;

  // ── modal state ───────────────────────────────────────────────────────────
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [budgetName, setBudgetName] = useState('');
  const [incomeRows, setIncomeRows] = useState<ModalRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ModalRow[]>([]);
  const [effDate, setEffDate] = useState<EffDate>('this');
  const [customMonthKey, setCustomMonthKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedBudgetIds, setExpandedBudgetIds] = useState<Set<string>>(new Set());
  const [duplicateSourceBudgetId, setDuplicateSourceBudgetId] = useState<string>('');
  const [duplicatingBudget, setDuplicatingBudget] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [incomeCategorySuggestions, setIncomeCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [expenseCategorySuggestions, setExpenseCategorySuggestions] = useState<CategorySuggestion[]>([]);

  // ── modal derived totals ──────────────────────────────────────────────────
  const modalIncomeTotal = incomeRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const modalExpenseTotal = expenseRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const modalSavings = modalIncomeTotal - modalExpenseTotal;

  // ── month keys ────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthDate.getFullYear()}-${pad2(nextMonthDate.getMonth() + 1)}`;

  function getStartMonthKey() {
    if (effDate === 'this') return thisMonthKey;
    if (effDate === 'next') return nextMonthKey;
    return customMonthKey || thisMonthKey;
  }

  const isFirstBudget = categorySets.length === 0;

  // ── modal actions ─────────────────────────────────────────────────────────
  async function loadIncomeCategorySuggestions(query = '') {
    const suggestions = await onGetIncomeCategorySuggestions(query);
    setIncomeCategorySuggestions(suggestions);
  }

  async function loadExpenseCategorySuggestions(query = '') {
    const suggestions = await onGetExpenseCategorySuggestions(query);
    setExpenseCategorySuggestions(suggestions);
  }

  function openCreateModal() {
    setBudgetName('');
    setIncomeRows([{ uid: newRowId(), name: '', amount: '' }]);
    setExpenseRows([{ uid: newRowId(), name: '', amount: '' }]);
    setEffDate('this');
    setCustomMonthKey(thisMonthKey);
    setModalStep(1);
    setModalMode('create');
    const defaultSourceBudgetId = activeBudget?.id || categorySets[0]?.id || '';
    setDuplicateSourceBudgetId(defaultSourceBudgetId);
    setDuplicateError(null);
    void loadIncomeCategorySuggestions();
    void loadExpenseCategorySuggestions();
  }

  function openEditModal() {
    if (!activeBudget) return;
    setBudgetName(activeBudget.name);
    setIncomeRows(
      incomeCategories.length > 0
        ? incomeCategories.map((c) => ({ uid: newRowId(), categoryId: c.id, name: c.name, amount: String(c.budget) }))
        : [{ uid: newRowId(), name: '', amount: '' }],
    );
    setExpenseRows(
      expenseCategories.length > 0
        ? expenseCategories.map((c) => ({ uid: newRowId(), categoryId: c.id, name: c.name, amount: String(c.budget) }))
        : [{ uid: newRowId(), name: '', amount: '' }],
    );
    setModalMode('edit');
    void loadIncomeCategorySuggestions();
    void loadExpenseCategorySuggestions();
  }

  function closeModal() {
    setModalMode(null);
    setModalStep(1);
    setDuplicateError(null);
    setDuplicatingBudget(false);
  }

  async function handleCreateCustomIncomeCategory(name: string) {
    const suggestion = await onCreateCustomIncomeCategory(name);
    setIncomeCategorySuggestions((current) => {
      if (current.some((entry) => entry.name.toLowerCase() === suggestion.name.toLowerCase())) {
        return current;
      }
      return [suggestion, ...current];
    });
    return suggestion;
  }

  async function handleCreateCustomExpenseCategory(name: string) {
    const suggestion = await onCreateCustomExpenseCategory(name);
    setExpenseCategorySuggestions((current) => {
      if (current.some((entry) => entry.name.toLowerCase() === suggestion.name.toLowerCase())) {
        return current;
      }
      return [suggestion, ...current];
    });
    return suggestion;
  }

  async function handleDuplicateFromBudget() {
    if (!duplicateSourceBudgetId || duplicatingBudget) {
      return;
    }

    setDuplicatingBudget(true);
    setDuplicateError(null);
    try {
      const sourceBudget = categorySets.find((budget) => budget.id === duplicateSourceBudgetId) || null;
      const sourceCategories = await onGetBudgetCategories(duplicateSourceBudgetId);

      const income = sourceCategories
        .filter((category) => category.categoryType === 'income')
        .sort((left, right) => right.budget - left.budget)
        .map((category) => ({
          uid: newRowId(),
          categoryId: category.id,
          name: category.name,
          amount: String(category.budget),
        }));

      const expenses = sourceCategories
        .filter((category) => category.categoryType === 'expense')
        .sort((left, right) => right.budget - left.budget)
        .map((category) => ({
          uid: newRowId(),
          categoryId: category.id,
          name: category.name,
          amount: String(category.budget),
        }));

      setBudgetName(sourceBudget ? `${sourceBudget.name} Copy` : 'Budget Copy');
      setIncomeRows(income.length > 0 ? income : [{ uid: newRowId(), name: '', amount: '' }]);
      setExpenseRows(expenses.length > 0 ? expenses : [{ uid: newRowId(), name: '', amount: '' }]);
    } catch (error) {
      setDuplicateError(
        error instanceof Error ? error.message : 'Could not duplicate budget categories.',
      );
    } finally {
      setDuplicatingBudget(false);
    }
  }

  function addRow(type: 'income' | 'expense') {
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;
    setter((prev) => [...prev, { uid: newRowId(), name: '', amount: '' }]);
  }

  function removeRow(type: 'income' | 'expense', uid: string) {
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;
    setter((prev) => prev.filter((r) => r.uid !== uid));
  }

  function updateRow(type: 'income' | 'expense', uid: string, field: 'name' | 'amount', value: string) {
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;
    setter((prev) => prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)));
  }

  async function handleSaveCreate() {
    if (!budgetName.trim()) return;
    setSaving(true);
    try {
      const startMonthKey = isFirstBudget ? thisMonthKey : getStartMonthKey();
      await onCreateBudgetWithCategories({
        name: budgetName.trim(),
        isDefault: true,
        startMonthKey,
        incomeCategories: incomeRows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), budget: Number(r.amount) || 0 })),
        expenseCategories: expenseRows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), budget: Number(r.amount) || 0 })),
      });
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!activeBudget || !budgetName.trim()) return;
    setSaving(true);
    try {
      const originalIds = new Set(categories.map((c) => c.id));
      const keptIds = new Set(
        [...incomeRows, ...expenseRows]
          .filter((r) => r.categoryId)
          .map((r) => r.categoryId as string),
      );
      const deletedCategoryIds = [...originalIds].filter((id) => !keptIds.has(id));

      await onEditBudgetWithCategories(activeBudget.id, {
        name: budgetName.trim(),
        incomeCategories: incomeRows
          .filter((r) => r.name.trim())
          .map((r) => ({ id: r.categoryId, name: r.name.trim(), budget: Number(r.amount) || 0 })),
        expenseCategories: expenseRows
          .filter((r) => r.name.trim())
          .map((r) => ({ id: r.categoryId, name: r.name.trim(), budget: Number(r.amount) || 0 })),
        deletedCategoryIds,
      });
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  function toggleAccordion(id: string) {
    setExpandedBudgetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── active budget metadata ────────────────────────────────────────────────
  const activeSince = activeBudget
    ? budgetActiveSince(activeBudget.id, monthAssignments, activeBudget.createdAt)
    : null;
  const budgetVersionLabel = activeBudget
    ? `Budget ${categorySets.findIndex((b) => b.id === activeBudget.id) + 1}`
    : '–';
  const effectivePeriodLabel = activeSince ? `Effective ${activeSince} – present` : 'Active budget';

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-6">

      {/* ── Active budget card ─────────────────────────────────────────────── */}
      {activeBudget ? (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">

          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[1.05rem] font-semibold text-[var(--color-text-primary)]">
                  {activeBudget.name}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-light)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-accent-dark)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                  Active
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{effectivePeriodLabel}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openEditModal}
                disabled={categoriesLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                Edit Budget
              </button>
              <Button variant="primary" onClick={openCreateModal}>
                <Plus className="h-4 w-4" strokeWidth={2} />
                Create New Budget
              </Button>
            </div>
          </div>

          {/* Loading */}
          {categoriesLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-[var(--color-text-muted)]">
              Loading categories...
            </div>
          ) : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-1 border-b border-[var(--color-border)] sm:grid-cols-3">
                <div className="border-b border-[var(--color-border)] px-5 py-4 sm:border-b-0 sm:border-r">
                  <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Planned Income
                  </p>
                  <p className="mt-1.5 font-display text-[1.9rem] font-bold tracking-[-0.03em] text-[var(--color-accent-dark)]">
                    {formatCurrency(totalIncome)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {incomeCategories.length} income {incomeCategories.length === 1 ? 'category' : 'categories'}
                  </p>
                </div>
                <div className="border-b border-[var(--color-border)] px-5 py-4 sm:border-b-0 sm:border-r">
                  <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Planned Expenses
                  </p>
                  <p className="mt-1.5 font-display text-[1.9rem] font-bold tracking-[-0.03em] text-[var(--color-negative)]">
                    {formatCurrency(totalExpenses)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {expenseCategories.length} expense {expenseCategories.length === 1 ? 'category' : 'categories'}
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Planned Savings
                  </p>
                  <p
                    className={`mt-1.5 font-display text-[1.9rem] font-bold tracking-[-0.03em] ${
                      plannedSavings >= 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
                    }`}
                  >
                    {plannedSavings < 0 ? '-' : ''}{formatCurrency(Math.abs(plannedSavings))}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {totalIncome > 0
                      ? `${Math.round((plannedSavings / totalIncome) * 100)}% of income`
                      : 'No income set'}
                  </p>
                </div>
              </div>

              {/* Budget body */}
              {incomeCategories.length > 0 || expenseCategories.length > 0 ? (
                <div className="space-y-6 px-5 py-5">
                  {incomeCategories.length > 0 && (
                    <div>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-accent)]" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-dark)]">
                          Income
                        </p>
                      </div>
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                              Category
                            </th>
                            <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                              Monthly Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {incomeCategories.map((cat) => (
                            <tr
                              key={cat.id}
                              className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-alt)]"
                            >
                              <td className="py-2 text-sm text-[var(--color-text-primary)]">{cat.name}</td>
                              <td className="py-2 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                                {formatCurrency(cat.budget)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-1.5 flex items-center justify-between rounded-[6px] bg-[var(--color-surface-alt)] px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">
                          Total Income
                        </span>
                        <span className="font-display text-sm font-bold text-[var(--color-accent-dark)]">
                          {formatCurrency(totalIncome)}
                        </span>
                      </div>
                    </div>
                  )}

                  {expenseCategories.length > 0 && (
                    <div>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-negative)]" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-negative)]">
                          Expenses
                        </p>
                      </div>
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                              Category
                            </th>
                            <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                              Monthly Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenseCategories.map((cat) => (
                            <tr
                              key={cat.id}
                              className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-alt)]"
                            >
                              <td className="py-2 text-sm text-[var(--color-text-primary)]">{cat.name}</td>
                              <td className="py-2 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                                {formatCurrency(cat.budget)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-1.5 flex items-center justify-between rounded-[6px] bg-[var(--color-surface-alt)] px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">
                          Total Expenses
                        </span>
                        <span className="font-display text-sm font-bold text-[var(--color-negative)]">
                          {formatCurrency(totalExpenses)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                  No categories yet.{' '}
                  <button
                    type="button"
                    className="font-medium text-[var(--color-accent)] hover:underline"
                    onClick={openEditModal}
                  >
                    Edit Budget
                  </button>{' '}
                  to add income and expense categories.
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Empty state */
        <div className="overflow-hidden rounded-[14px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-14 text-center">
          <h3 className="font-display text-xl font-semibold text-[var(--color-text-primary)]">
            Create your first budget
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
            Define your planned income and expense categories to start tracking your financial health.
          </p>
          <Button variant="primary" className="mt-5" onClick={openCreateModal}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Create Budget
          </Button>
        </div>
      )}

      {/* ── Past budgets card ─────────────────────────────────────────────── */}
      {pastBudgets.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h2 className="font-display text-[1.05rem] font-semibold text-[var(--color-text-primary)]">
              Past Budgets
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
              Archived versions — each month's performance is tracked against the budget that was active at that time.
            </p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {pastBudgets.map((budget, i) => {
              const period = budgetPeriod(budget.id, monthAssignments);
              const isExpanded = expandedBudgetIds.has(budget.id);
              const versionNum = categorySets.findIndex((b) => b.id === budget.id) + 1;
              return (
                <div key={budget.id}>
                  <button
                    type="button"
                    onClick={() => toggleAccordion(budget.id)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[var(--color-surface-alt)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" />
                        Archived
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{budget.name}</p>
                        {period && (
                          <p className="text-xs text-[var(--color-text-secondary)]">{period}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-xs text-[var(--color-text-secondary)]">Budget {versionNum}</p>
                      <ChevronDown
                        className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        strokeWidth={1.8}
                      />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-alt)] px-5 py-4">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Performance for this period was tracked against{' '}
                        <strong className="text-[var(--color-text-primary)]">{budget.name}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelectCategorySet(budget.id)}
                        className="mt-2 text-sm font-medium text-[var(--color-accent)] hover:underline"
                      >
                        View categories →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {modalMode !== null && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-text-primary)]/45 px-4 py-10"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-[660px] overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">

            {/* ── STEP 1 (create) or edit ── */}
            {((modalMode === 'create' && modalStep === 1) || modalMode === 'edit') && (
              <>
                <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                      {modalMode === 'create' ? 'Create Budget' : 'Edit Budget'}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {modalMode === 'edit'
                        ? 'Update categories. Changes apply to the current active budget.'
                        : isFirstBudget
                          ? 'Name your budget and define your income and expense categories.'
                          : 'Step 1 of 2 – Name your budget and set category amounts.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-border)]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>

                <div className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5">
                  {modalMode === 'create' && categorySets.length > 0 ? (
                    <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-alt)]/80 p-4 sm:p-5">
                      <div className="grid gap-4 xl:grid-cols-[1fr_1.45fr] xl:items-end">
                        <div>
                          <span className="inline-flex rounded-full bg-[var(--color-border)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                            Optional Shortcut
                          </span>
                          <p className="mt-2.5 font-display text-[14px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
                            Start from an existing budget
                          </p>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                            Pick a saved budget template and instantly prefill the fields below.
                          </p>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                            Existing Budget
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                              <select
                                value={duplicateSourceBudgetId}
                                onChange={(event) => setDuplicateSourceBudgetId(event.target.value)}
                                className={`${inputCls} h-11 appearance-none rounded-[18px] bg-[var(--color-surface)] pr-10 text-sm`}
                              >
                                {categorySets.map((budget) => (
                                  <option key={budget.id} value={budget.id}>
                                    {budget.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
                                strokeWidth={2}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleDuplicateFromBudget}
                              disabled={!duplicateSourceBudgetId || duplicatingBudget}
                              className="inline-flex h-11 shrink-0 items-center justify-center rounded-[18px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {duplicatingBudget ? 'Duplicating...' : 'Duplicate'}
                            </button>
                          </div>
                        </div>
                      </div>
                      {duplicateError ? (
                        <p className="mt-2 text-xs text-[var(--color-negative)]">{duplicateError}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                      Budget Name
                    </label>
                    <input
                      type="text"
                      value={budgetName}
                      onChange={(e) => setBudgetName(e.target.value)}
                      placeholder="e.g. 2026 Budget"
                      className={inputCls}
                    />
                  </div>

                  <BudgetModalSection
                    type="income"
                    rows={incomeRows}
                    total={modalIncomeTotal}
                    label="Income Categories"
                    totalLabel="Planned Income"
                    onAddRow={addRow}
                    onRemoveRow={removeRow}
                    onUpdateRow={updateRow}
                    suggestions={incomeCategorySuggestions}
                    onCreateCustomCategory={handleCreateCustomIncomeCategory}
                  />

                  <BudgetModalSection
                    type="expense"
                    rows={expenseRows}
                    total={modalExpenseTotal}
                    label="Expense Categories"
                    totalLabel="Planned Expenses"
                    onAddRow={addRow}
                    onRemoveRow={removeRow}
                    onUpdateRow={updateRow}
                    suggestions={expenseCategorySuggestions}
                    onCreateCustomCategory={handleCreateCustomExpenseCategory}
                  />

                  {/* Savings preview */}
                  <div className="flex items-center justify-between rounded-[10px] bg-[var(--color-surface-alt)] px-4 py-3">
                    <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                      Planned Savings
                    </span>
                    <span
                      className={`font-display text-base font-bold ${
                        modalSavings >= 0 ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-negative)]'
                      }`}
                    >
                      {modalSavings < 0 ? '-' : ''}{formatCurrency(Math.abs(modalSavings))}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)]"
                  >
                    Cancel
                  </button>
                  {modalMode === 'edit' ? (
                    <Button
                      variant="primary"
                      onClick={handleSaveEdit}
                      disabled={!budgetName.trim() || saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  ) : isFirstBudget ? (
                    <Button
                      variant="primary"
                      onClick={handleSaveCreate}
                      disabled={!budgetName.trim() || saving}
                    >
                      {saving ? 'Saving...' : 'Save Budget'}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => setModalStep(2)}
                      disabled={!budgetName.trim()}
                    >
                      Next: Choose start month →
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* ── STEP 2 – effective date ── */}
            {modalMode === 'create' && modalStep === 2 && (
              <>
                <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                      Create Budget
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Step 2 of 2 – Choose when this budget takes effect.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-border)]"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6 px-6 py-5">
                  {/* Left: date options */}
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                      Choose when this budget starts
                    </h3>
                    <p className="mb-4 mt-1 text-sm text-[var(--color-text-secondary)]">
                      The selected month becomes the start of the new budget version. Chiiz will close the previous budget at the end of the prior month.
                    </p>

                    {(
                      [
                        {
                          id: 'this' as EffDate,
                          title: 'Start this month',
                          sub: `Make this the current budget immediately for <strong>${monthKeyLabel(thisMonthKey)}</strong>.`,
                        },
                        {
                          id: 'next' as EffDate,
                          title: 'Start next month',
                          sub: `Keep the current budget for this month, then activate in <strong>${monthKeyLabel(nextMonthKey)}</strong>.`,
                        },
                        {
                          id: 'custom' as EffDate,
                          title: 'Choose a custom month',
                          sub: 'Pick a specific past or future month.',
                        },
                      ] satisfies Array<{ id: EffDate; title: string; sub: string }>
                    ).map((opt) => {
                      const isSelected = effDate === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setEffDate(opt.id)}
                          className={`mb-2 flex w-full items-start gap-3 rounded-[10px] border p-3.5 text-left transition ${
                            isSelected
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-alt)]'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              isSelected
                                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                                : 'border-[var(--color-border-strong)]'
                            }`}
                          >
                            {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p
                              className={`text-sm font-semibold ${
                                isSelected ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-text-primary)]'
                              }`}
                            >
                              {opt.title}
                            </p>
                            {/* eslint-disable-next-line react/no-danger */}
                            <p
                              className="mt-0.5 text-xs text-[var(--color-text-secondary)]"
                              dangerouslySetInnerHTML={{ __html: opt.sub }}
                            />
                          </div>
                        </button>
                      );
                    })}

                    {effDate === 'custom' && (
                      <div className="mt-2 rounded-[10px] bg-[var(--color-surface-alt)] p-3.5">
                        <select
                          value={customMonthKey}
                          onChange={(e) => setCustomMonthKey(e.target.value)}
                          className="w-full rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                        >
                          <option value="">Select month…</option>
                          {assignmentMonthOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Right: "What will happen" */}
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                      What will happen
                    </h3>
                    <p className="mb-4 mt-1 text-sm text-[var(--color-text-secondary)]">
                      This preview gives you confidence that history will remain correct after saving.
                    </p>

                    <div className="mb-3 rounded-[10px] border border-[rgba(45,204,143,0.25)] bg-[var(--color-accent-light)] p-3.5">
                      <p className="text-sm font-bold text-[var(--color-accent-dark)]">
                        {budgetName} will become active starting {monthKeyLabel(getStartMonthKey())}.
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
                        {activeBudget?.name || 'Your current budget'} will automatically remain attached to all earlier months. Performance for those months will still use the previous budget.
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
                      <p className="text-sm font-bold text-[#92400E]">History stays intact</p>
                      <p className="mt-1.5 text-xs text-[#78350F]">
                        Chiiz stores this as a <strong>new budget version</strong>, not an overwrite. That preserves your historical budget-to-performance matching.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)]"
                  >
                    ← Back
                  </button>
                  <Button
                    variant="primary"
                    onClick={handleSaveCreate}
                    disabled={saving || (effDate === 'custom' && !customMonthKey)}
                  >
                    {saving ? 'Saving...' : 'Save Budget'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
