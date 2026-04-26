import {
  ArrowRight,
  ArrowUpFromLine,
  Check,
  Download,
  PencilLine,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../lib/format';
import {
  downloadHistoricalTemplate,
  fetchHistoricalUploadMonths,
  importHistoricalUpload,
  previewHistoricalUpload,
} from '../lib/api';
import type { Category, HistoricalUploadMonth } from '../types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

type CategoryRow = {
  id: string;
  categoryId: string;
  amount: string;
};

type UploadedMonth = {
  id: string;
  monthKey: string; // e.g. "2024-05"
  income: number;
  spending: number;
  categoryRows?: Array<{ categoryId: string; amount: number }>;
  categoryCount?: number;
  notes?: string;
  source: 'manual' | 'csv';
};

type UploadDataViewProps = {
  categories: Category[];
  onDataImported?: () => Promise<void> | void;
};

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 4 + i); // 4 years back, 1 ahead

function formatMonthKey(month: number, year: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function labelFromMonthKey(key: string) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

function newCatRowId() {
  return Math.random().toString(36).slice(2);
}

function newEntryId() {
  return Math.random().toString(36).slice(2);
}

function isSupportedUploadFile(name: string) {
  return /\.(csv|xlsx|xls)$/i.test(name);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

const inputClass =
  'w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]';

const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]';

export function UploadDataView({ categories, onDataImported }: UploadDataViewProps) {
  const now = new Date();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'csv'>('csv');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1–12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [income, setIncome] = useState('');
  const [spending, setSpending] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([
    { id: newCatRowId(), categoryId: '', amount: '' },
  ]);
  const [uploadedMonths, setUploadedMonths] = useState<UploadedMonth[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvReadyToImport, setCsvReadyToImport] = useState(false);
  const [uploadPreviewSummary, setUploadPreviewSummary] = useState<{
    rowsReady: number;
    monthsDetected: number;
    categoriesDetected: number;
  } | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadValidationErrors, setUploadValidationErrors] = useState<string[]>([]);
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadingMonthsLoading, setUploadingMonthsLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const expenseCategories = categories.filter((c) => c.categoryType === 'expense');

  useEffect(() => {
    void (async () => {
      try {
        const result = await fetchHistoricalUploadMonths();
        setUploadedMonths(
          result.months.map((month) => ({
            id: month.id,
            monthKey: month.monthKey,
            income: month.income,
            spending: month.spending,
            categoryCount: month.categoryCount,
            source: month.source,
          })),
        );
      } catch {
        // Keep page usable even if historical list endpoint fails.
      } finally {
        setUploadingMonthsLoading(false);
      }
    })();
  }, []);

  function addCategoryRow() {
    setCategoryRows((prev) => [...prev, { id: newCatRowId(), categoryId: '', amount: '' }]);
  }

  function removeCategoryRow(id: string) {
    setCategoryRows((prev) => prev.filter((row) => row.id !== id));
  }

  function updateCategoryRow(id: string, field: 'categoryId' | 'amount', value: string) {
    setCategoryRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }

  function clearForm() {
    setIncome('');
    setSpending('');
    setNotes('');
    setCategoryRows([{ id: newCatRowId(), categoryId: '', amount: '' }]);
  }

  function showSavedToast() {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  }

  function saveUploadedMonth(entry: UploadedMonth) {
    setUploadedMonths((prev) => {
      const exists = prev.some((m) => m.monthKey === entry.monthKey);
      if (exists) {
        return prev.map((m) => (m.monthKey === entry.monthKey ? entry : m));
      }
      return [...prev, entry].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    });
  }

  function handleSaveManual(event: React.FormEvent) {
    event.preventDefault();

    const monthKey = formatMonthKey(selectedMonth, selectedYear);
    const filledRows = categoryRows
      .filter((row) => row.categoryId && row.amount)
      .map((row) => ({ categoryId: row.categoryId, amount: Number(row.amount) }));

    const entry: UploadedMonth = {
      id: newEntryId(),
      monthKey,
      income: Number(income) || 0,
      spending: Number(spending) || 0,
      categoryRows: filledRows,
      notes: notes.trim(),
      source: 'manual',
    };

    saveUploadedMonth(entry);
    clearForm();
    showSavedToast();
  }

  function deleteMonth(id: string) {
    setUploadedMonths((prev) => prev.filter((m) => m.id !== id));
  }

  function handleIncomingFile(file: File | null) {
    if (!file) {
      return;
    }
    if (!isSupportedUploadFile(file.name)) {
      setUploadError('Only CSV, XLSX, and XLS files are supported.');
      setUploadValidationErrors([]);
      setUploadSuccess(null);
      return;
    }
    setUploadError(null);
    setUploadValidationErrors([]);
    setUploadSuccess(null);
    setUploadWarning(null);
    setUploadPreviewSummary(null);
    setSelectedUploadFile(file);
    setCsvFileName(file.name);
    void (async () => {
      setUploadPreviewLoading(true);
      try {
        const preview = await previewHistoricalUpload({
          fileName: file.name,
          fileContentBase64: await fileToBase64(file),
        });
        setCsvReadyToImport(preview.ready);
        setUploadPreviewSummary({
          rowsReady: preview.rowsReady,
          monthsDetected: preview.monthsDetected,
          categoriesDetected: preview.categoriesDetected,
        });
        setUploadWarning(preview.warning || null);
      } catch (error) {
        setCsvReadyToImport(false);
        setUploadPreviewSummary(null);
        setUploadWarning(null);
        setUploadError(
          error instanceof Error
            ? error.message
            : 'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        );
        const validationErrors =
          error && typeof error === 'object' && 'validationErrors' in error
            ? (error.validationErrors as string[])
            : [];
        setUploadValidationErrors(validationErrors.slice(0, 8));
      } finally {
        setUploadPreviewLoading(false);
      }
    })();
  }

  function handleImportCsv() {
    if (!csvReadyToImport || !selectedUploadFile || importing) {
      return;
    }
    void (async () => {
      setImporting(true);
      setUploadError(null);
      setUploadValidationErrors([]);
      setUploadSuccess(null);
      try {
        const result = await importHistoricalUpload({
          fileName: selectedUploadFile.name,
          fileContentBase64: await fileToBase64(selectedUploadFile),
        });
        setUploadedMonths(
          result.months.map((month) => ({
            id: month.id,
            monthKey: month.monthKey,
            income: month.income,
            spending: month.spending,
            categoryCount: month.categoryCount,
            source: month.source,
          })),
        );
        setUploadSuccess(`Import complete. ${result.rowsImported} rows imported successfully.`);
        setUploadWarning(result.warning || null);
        if (onDataImported) {
          await onDataImported();
        }
        setCsvReadyToImport(false);
        setCsvFileName(null);
        setSelectedUploadFile(null);
        setUploadPreviewSummary(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : 'Import failed. Please make sure your file includes Date, CategoryType, CategoryName, and Amount.',
        );
        const validationErrors =
          error && typeof error === 'object' && 'validationErrors' in error
            ? (error.validationErrors as string[])
            : [];
        setUploadValidationErrors(validationErrors.slice(0, 8));
      } finally {
        setImporting(false);
      }
    })();
  }

  function handleDownloadTemplate() {
    void (async () => {
      try {
        const blob = await downloadHistoricalTemplate();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'chiiz-transactions-template.xlsx';
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        setUploadError('Failed to download template.');
      }
    })();
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Upload Historical Data
        </h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          Import past income, spending, and category breakdowns to build a complete financial
          picture.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => setUploadMethod('manual')}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition sm:w-auto ${
            uploadMethod === 'manual'
              ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-white'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <PencilLine className="h-4 w-4" strokeWidth={1.7} />
          Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setUploadMethod('csv')}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition sm:w-auto ${
            uploadMethod === 'csv'
              ? 'border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-white'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <ArrowUpFromLine className="h-4 w-4" strokeWidth={1.7} />
          Upload CSV / Excel
        </button>
      </div>

      {uploadMethod === 'manual' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
                Enter Monthly Data
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                Fill in income, total spending, and optional category breakdown for a given month.
              </p>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-5 px-4 py-5 sm:px-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Month</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className={inputClass}
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Year</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className={inputClass}
                  >
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <hr className="border-[var(--color-border)]" />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Income</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                      placeholder="0.00"
                      required
                      className={`${inputClass} pl-6`}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className={labelClass}>Total Spending</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={spending}
                      onChange={(e) => setSpending(e.target.value)}
                      placeholder="0.00"
                      required
                      className={`${inputClass} pl-6`}
                    />
                  </div>
                </label>
              </div>

              <hr className="border-[var(--color-border)]" />

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Category Breakdown
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                      Optional - add spending per category
                    </p>
                  </div>
                  <Button type="button" variant="secondary" onClick={addCategoryRow}>
                    + Add category
                  </Button>
                </div>

                <div className="space-y-2">
                  {categoryRows.map((row) => (
                    <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={row.categoryId}
                        onChange={(e) => updateCategoryRow(row.id, 'categoryId', e.target.value)}
                        className={`${inputClass} flex-[1.2]`}
                      >
                        <option value="">Select category</option>
                        {expenseCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateCategoryRow(row.id, 'amount', e.target.value)}
                          placeholder="0.00"
                          className={`${inputClass} pl-6`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCategoryRow(row.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[var(--color-negative)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-negative)] sm:self-auto"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className={labelClass}>
                  Notes{' '}
                  <span className="font-normal normal-case tracking-normal text-[var(--color-text-muted)]">
                    (optional)
                  </span>
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Includes holiday spending, one-off large purchase..."
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </label>

              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
                <Button type="submit" variant="primary" className="flex-1 justify-center">
                  Save Month
                </Button>
                <Button type="button" variant="secondary" onClick={clearForm}>
                  Clear
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-0">
              <div className="border-b border-[var(--color-border)] px-5 py-4">
                <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
                  How it works
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                {[
                  'Select the month and year you want to record.',
                  'Enter your total income and total spending for that month.',
                  'Optionally break spending into categories like Dining, Groceries, Rent.',
                  'Hit Save - Chiiz will include this data in your Performance charts.',
                ].map((text, index) => (
                  <div key={index} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[9px] font-bold text-[var(--color-accent-dark)]">
                      {index + 1}
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>
                  </div>
                ))}
                <div className="mt-1 rounded-[var(--radius-sm)] bg-[var(--color-accent-light)] px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold text-[var(--color-accent-dark)]">Tip</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    Category totals do not need to add up to total spending - you can add just the
                    categories you remember.
                  </p>
                </div>
              </div>
            </Card>

            <UploadedMonthsCard
              uploadedMonths={uploadedMonths}
              onDelete={deleteMonth}
              loading={uploadingMonthsLoading}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
                Upload CSV or Excel file
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                We will parse your file and map columns to date, category type, category name, and
                amount.
              </p>
            </div>

            <div className="space-y-5 px-4 py-5 sm:px-5">
              <p className="text-xs text-[var(--color-text-muted)]">
                Uploads are limited to the first 1000 rows.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={uploadPreviewLoading || importing}
                onChange={(event) => handleIncomingFile(event.target.files?.[0] || null)}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!uploadPreviewLoading && !importing) {
                    openFilePicker();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!uploadPreviewLoading && !importing) {
                    setDragOver(true);
                  }
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  if (!uploadPreviewLoading && !importing) {
                    handleIncomingFile(event.dataTransfer.files?.[0] || null);
                  }
                }}
                className={`rounded-[12px] border border-dashed px-8 py-10 text-center transition ${
                  dragOver
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/45'
                    : 'border-[var(--color-border-strong)] bg-[var(--color-surface-alt)]'
                } ${uploadPreviewLoading || importing ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
              >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                  {uploadPreviewLoading ? (
                    <Upload className="h-5 w-5 animate-pulse" strokeWidth={1.8} />
                  ) : csvReadyToImport ? (
                    <Check className="h-5 w-5 text-[var(--color-accent-dark)]" strokeWidth={2} />
                  ) : (
                    <Upload className="h-5 w-5" strokeWidth={1.8} />
                  )}
                </div>
                <p className="text-[1rem] font-semibold text-[var(--color-text-primary)]">
                  {csvFileName || 'Drop your file here'}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  or{' '}
                  <span className="font-semibold text-[var(--color-accent)]">browse to upload</span>
                </p>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Supports CSV, XLSX, XLS - Max 10MB
                </p>
              </div>

              {uploadError ? (
                <div className="rounded-[10px] border border-[var(--color-negative)]/35 bg-[var(--color-negative)]/10 px-3.5 py-3">
                  <p className="text-sm font-semibold text-[var(--color-negative)]">{uploadError}</p>
                  {uploadValidationErrors.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
                      {uploadValidationErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {uploadWarning ? (
                <div className="rounded-[10px] border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/10 px-3.5 py-2.5 text-xs text-[var(--color-text-primary)]">
                  {uploadWarning}
                </div>
              ) : null}

              {uploadSuccess ? (
                <div className="rounded-[10px] border border-[var(--color-accent-dark)]/30 bg-[var(--color-accent-light)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-accent-dark)]">
                  {uploadSuccess}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 rounded-[10px] bg-[var(--color-surface-alt)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Not sure about the format?
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    Download the Chiiz CSV template - just fill in your numbers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center justify-center gap-1 self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)] sm:self-auto"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Template
                </button>
              </div>

              {csvReadyToImport && uploadPreviewSummary ? (
                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Column Mapping
                  </p>
                  <div className="mb-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3.5 py-2.5 text-xs text-[var(--color-text-secondary)]">
                    {uploadPreviewSummary.rowsReady} rows ready · {uploadPreviewSummary.monthsDetected}{' '}
                    months detected · {uploadPreviewSummary.categoriesDetected} categories detected
                  </div>
                  <div className="space-y-2">
                    {(
                      [
                        ['Date', ['date', 'transaction_date', 'posted_date']],
                        ['Category Type', ['categorytype', 'type', 'transaction_type']],
                        ['Category Name', ['categoryname', 'category', 'name']],
                        ['Amount', ['amount', 'value', 'total']],
                      ] as Array<[string, string[]]>
                    ).map(([target, options]) => (
                      <div key={target} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[110px_20px_minmax(0,1fr)] sm:items-center sm:gap-2">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{target}</p>
                        <ArrowRight className="hidden h-3.5 w-3.5 text-[var(--color-text-muted)] sm:block" strokeWidth={1.8} />
                        <select className={`${inputClass} py-1.5 text-xs`}>
                          {(options as string[]).map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className="mt-4 w-full justify-center"
                    onClick={handleImportCsv}
                    disabled={importing}
                  >
                    {importing ? 'Importing...' : 'Import Data'}
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-0">
              <div className="border-b border-[var(--color-border)] px-5 py-4">
                <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
                  Expected format
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                  Your file should contain these columns
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="rounded-[8px] bg-[var(--color-surface-alt)] px-4 py-3 font-mono text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  Date, CategoryType, CategoryName, Amount
                </div>
                {[
                  'Date should be a valid date (YYYY-MM-DD is recommended)',
                  'CategoryType must be Income or Expense',
                  'One row per transaction summary line',
                  'Amounts can include $ signs or commas',
                ].map((line) => (
                  <div key={line} className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]">
                      <Check className="h-3 w-3" strokeWidth={2.2} />
                    </span>
                    <p className="text-sm text-[var(--color-text-secondary)]">{line}</p>
                  </div>
                ))}
              </div>
            </Card>

            <UploadedMonthsCard
              uploadedMonths={uploadedMonths}
              onDelete={deleteMonth}
              loading={uploadingMonthsLoading}
            />
          </div>
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-7 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--color-text-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          Month saved successfully ✓
        </div>
      )}
    </div>
  );
}

function UploadedMonthsCard({
  uploadedMonths,
  onDelete,
  loading,
}: {
  uploadedMonths: UploadedMonth[];
  onDelete: (id: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
            Uploaded months
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Loading uploaded transaction summaries...
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <p className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Uploaded months
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          {uploadedMonths.length === 0
            ? 'No historical data yet'
            : `${uploadedMonths.length} month${uploadedMonths.length === 1 ? '' : 's'} on record`}
        </p>
      </div>

      {uploadedMonths.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
          Save or import data to see it here.
        </p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {uploadedMonths.map((entry) => {
            const catCount = entry.categoryRows?.length ?? entry.categoryCount ?? 0;
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between px-5 py-3 transition hover:bg-[var(--color-surface-alt)]"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {labelFromMonthKey(entry.monthKey)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    Income {formatCurrency(entry.income)} · Spent {formatCurrency(entry.spending)}
                    {catCount > 0 ? ` · ${catCount} categor${catCount === 1 ? 'y' : 'ies'}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] ${
                      entry.source === 'csv'
                        ? 'bg-[#E0F2FE] text-[#0369A1]'
                        : 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
                    }`}
                  >
                    {entry.source === 'csv' ? 'CSV' : 'Manual'}
                  </span>
                  {entry.source === 'manual' ? (
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[var(--color-negative)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-negative)]"
                    >
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
