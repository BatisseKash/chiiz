import { LogOut, Menu, Plus } from 'lucide-react';
import { Button } from './Button';

type TopNavProps = {
  onSignOut: () => void;
  onAddTransaction?: () => void;
  onOpenMobileNav?: () => void;
};

export function TopNav({ onSignOut, onAddTransaction, onOpenMobileNav }: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 sm:px-4 md:px-6">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={onOpenMobileNav}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-primary)] transition hover:bg-[var(--color-border)]"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <span className="text-sm font-semibold text-[var(--color-text-secondary)] sm:hidden">Chiiz</span>
        </div>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
        <Button variant="primary" onClick={onAddTransaction} className="hidden sm:inline-flex">
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Add Transaction
        </Button>
        <div className="sm:hidden">
          <Button variant="primary" onClick={onAddTransaction}>
            <Plus className="h-4 w-4" strokeWidth={1.8} />
          </Button>
        </div>

        <Button variant="secondary" onClick={onSignOut} className="hidden sm:inline-flex">
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
          Sign out
        </Button>
          <Button variant="secondary" onClick={onSignOut} className="sm:hidden px-3">
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </header>
  );
}
