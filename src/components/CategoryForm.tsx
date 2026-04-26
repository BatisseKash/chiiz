import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Category } from '../types';
import { Button } from './Button';

type CategoryFormProps = {
  open: boolean;
  initialCategory?: Category | null;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    description: string;
    budget: number;
    categoryType: 'income' | 'expense';
  }) => void;
};

const inputClass =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-light)]';

const labelClass = 'mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]';

export function CategoryForm({
  open,
  initialCategory,
  onClose,
  onSave,
}: CategoryFormProps) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>('expense');
  const isEditing = Boolean(initialCategory);

  useEffect(() => {
    setName(initialCategory?.name ?? '');
    setBudget(initialCategory ? String(initialCategory.budget) : '');
    setCategoryType(initialCategory?.categoryType ?? 'expense');
  }, [initialCategory, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-text-primary)]/28 p-4">
      <div className="w-full max-w-[420px] overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="font-display text-[1.9rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
              {isEditing ? 'Edit Category' : 'Add Category'}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Create a budget category by entering a name and amount.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              name: name.trim(),
              description: initialCategory?.description || '',
              budget: Number(budget),
              categoryType,
            });
          }}
        >
          <label className="block">
            <span className={labelClass}>Category Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              placeholder="Dining"
              required
            />
          </label>

          <label className="block">
            <span className={labelClass}>Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              className={inputClass}
              placeholder="1000"
              required
            />
          </label>

          <fieldset className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Type
            </legend>
            <div className="mt-1 flex gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="radio"
                  checked={categoryType === 'expense'}
                  onChange={() => setCategoryType('expense')}
                  className="h-3.5 w-3.5"
                />
                Expense
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="radio"
                  checked={categoryType === 'income'}
                  onChange={() => setCategoryType('income')}
                  className="h-3.5 w-3.5"
                />
                Expected Income
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2.5 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Category
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
