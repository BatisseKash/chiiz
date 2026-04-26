import { Calendar, ChevronDown, Filter } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Option = {
  value: string;
  label: string;
};

type DashboardFiltersProps = {
  timePreset: 'month' | 'ytd' | 'last12' | 'all_time';
  onTimePresetChange: (value: 'month' | 'ytd' | 'last12' | 'all_time') => void;
  selectedMonths: string[];
  onSelectedMonthsChange: (value: string[]) => void;
  selectedYear: string;
  onSelectedYearChange: (value: string) => void;
  monthOptions: Option[];
  yearOptions: Option[];
  accountOptions: Option[];
  selectedAccount: string;
  onSelectedAccountChange: (value: string) => void;
  categoryOptions: Option[];
  selectedCategory: string;
  onSelectedCategoryChange: (value: string) => void;
  transactionType: 'all' | 'expense' | 'income';
  onTransactionTypeChange: (value: 'all' | 'expense' | 'income') => void;
  periodLabel: string;
};

const presetTabs: Array<{ value: 'month' | 'ytd' | 'last12' | 'all_time'; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last12', label: 'Last 12M' },
  { value: 'all_time', label: 'All Time' },
];

const selectClass =
  'h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]';

export function DashboardFilters({
  timePreset,
  onTimePresetChange,
  selectedMonths,
  onSelectedMonthsChange,
  selectedYear,
  onSelectedYearChange,
  monthOptions,
  yearOptions,
  accountOptions,
  selectedAccount,
  onSelectedAccountChange,
  categoryOptions,
  selectedCategory,
  onSelectedCategoryChange,
  transactionType,
  onTransactionTypeChange,
  periodLabel,
}: DashboardFiltersProps) {
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [monthQuery, setMonthQuery] = useState('');
  const [draftSelectedMonths, setDraftSelectedMonths] = useState<string[]>([]);

  useEffect(() => {
    if (!monthDropdownOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-dashboard-month-dropdown-root="true"]')) {
        setMonthDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [monthDropdownOpen]);

  const selectedMonthPills = useMemo(
    () =>
      monthOptions
        .filter((option) => selectedMonths.includes(option.value))
        .sort((left, right) => (left.value > right.value ? 1 : -1)),
    [monthOptions, selectedMonths],
  );

  const filteredMonthOptions = useMemo(() => {
    const query = monthQuery.trim().toLowerCase();
    if (!query) {
      return monthOptions;
    }
    return monthOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [monthOptions, monthQuery]);

  return (
    <section className="space-y-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:p-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {timePreset === 'month' ? (
            <div
              className="relative w-full sm:min-w-[280px] sm:max-w-[520px] sm:flex-1"
              data-dashboard-month-dropdown-root="true"
            >
              <button
                type="button"
                onClick={() => {
                  setDraftSelectedMonths([...selectedMonths]);
                  setMonthQuery('');
                  setMonthDropdownOpen((open) => !open);
                }}
                className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-1.5 text-left"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.8} />
                  {selectedMonthPills.length > 0 ? (
                    selectedMonthPills.map((item) => (
                      <span
                        key={item.value}
                        className="rounded-full border border-[#D4EBDF] bg-[#EDF7F2] px-2 py-0.5 text-[10px] font-semibold text-[#27795A]"
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
                <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.8} />
              </button>

              {monthDropdownOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_18px_50px_rgba(18,23,38,0.10)]">
                  <input
                    value={monthQuery}
                    onChange={(event) => setMonthQuery(event.target.value)}
                    placeholder="Search months like Jan 2026"
                    className="mb-2.5 h-9 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-xs font-medium text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]"
                  />
                  <div className="max-h-[250px] space-y-1 overflow-auto pr-1">
                    {filteredMonthOptions.map((option) => {
                      const checked = draftSelectedMonths.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setDraftSelectedMonths((current) => {
                              const exists = current.includes(option.value);
                              if (exists) {
                                return current.filter((value) => value !== option.value);
                              }
                              if (current.length >= 12) {
                                return current;
                              }
                              return [...current, option.value].sort((left, right) =>
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
                      Available months only · choose up to 12
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDraftSelectedMonths(monthOptions.slice(0, 3).map((option) => option.value))}
                        className="rounded-[8px] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                      >
                        Reset to last 3
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (draftSelectedMonths.length === 0) {
                            return;
                          }
                          onSelectedMonthsChange(draftSelectedMonths.slice(0, 12));
                          setMonthDropdownOpen(false);
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
          ) : null}

          {timePreset === 'ytd' ? (
            <label className="relative">
              <Calendar
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
                strokeWidth={1.8}
              />
              <select
                value={selectedYear}
                onChange={(event) => onSelectedYearChange(event.target.value)}
                className={`${selectClass} min-w-[148px] pl-8 pr-8`}
              >
                {yearOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
                strokeWidth={1.8}
              />
            </label>
          ) : null}

          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5">
            {presetTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTimePresetChange(tab.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  timePreset === tab.value
                    ? 'bg-[var(--color-text-primary)] text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs font-medium text-[var(--color-text-muted)]">{periodLabel}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">
          <Filter className="h-3 w-3" strokeWidth={1.8} />
          Filters
        </span>
        <select
          value={selectedAccount}
          onChange={(event) => onSelectedAccountChange(event.target.value)}
          className={`${selectClass} w-full sm:w-auto`}
        >
          {accountOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={selectedCategory}
          onChange={(event) => onSelectedCategoryChange(event.target.value)}
          className={`${selectClass} w-full sm:w-auto`}
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={transactionType}
          onChange={(event) =>
            onTransactionTypeChange(event.target.value as 'all' | 'expense' | 'income')
          }
          className={`${selectClass} w-full sm:w-auto`}
        >
          <option value="all">All transactions</option>
          <option value="expense">Expenses only</option>
          <option value="income">Income only</option>
        </select>
      </div>
    </section>
  );
}
