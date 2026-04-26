import { useEffect } from 'react';
import {
  BarChart3,
  LayoutDashboard,
  Link2,
  LogOut,
  Shapes,
  Upload,
  X,
  ReceiptText,
} from 'lucide-react';
import type { View } from '../types';

type MobileNavDrawerProps = {
  open: boolean;
  activeView: View;
  onClose: () => void;
  onSelectView: (view: View) => void;
  onSignOut: () => void;
};

const logoUrl = new URL('../../Chiiz logo.png', import.meta.url).href;

const mainNavItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'categories', label: 'Budget', icon: Shapes },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
];

const accountNavItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'settings', label: 'Linked Accounts', icon: Link2 },
];

const dataNavItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'upload', label: 'Upload Data', icon: Upload },
];

export function MobileNavDrawer({
  open,
  activeView,
  onClose,
  onSelectView,
  onSignOut,
}: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const renderNavButton = (item: { id: View; label: string; icon: typeof LayoutDashboard }) => {
    const Icon = item.icon;
    const isActive = activeView === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectView(item.id);
          onClose();
        }}
        className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'}`}
          strokeWidth={1.7}
        />
        <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
      </button>
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[var(--color-text-primary)]/45 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed left-0 top-0 z-50 flex h-full w-[280px] max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl lg:hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-white">
              <img src={logoUrl} alt="Chiiz logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="font-display text-[1.4rem] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Chiiz
              </p>
              <p className="-mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Smart budgeting
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] transition hover:bg-[var(--color-border)]"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-5">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Main
          </p>
          <nav className="flex flex-col gap-0.5">{mainNavItems.map(renderNavButton)}</nav>

          <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Accounts
          </p>
          <nav className="flex flex-col gap-0.5">{accountNavItems.map(renderNavButton)}</nav>

          <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Data
          </p>
          <nav className="flex flex-col gap-0.5">{dataNavItems.map(renderNavButton)}</nav>
        </div>

        <div className="border-t border-[var(--color-border)] p-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-border)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.6} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
