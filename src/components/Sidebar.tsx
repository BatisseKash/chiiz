import { BarChart3, LayoutDashboard, Link2, ReceiptText, Shapes, Upload } from 'lucide-react';
import type { View } from '../types';

type SidebarProps = {
  activeView: View;
  onSelect: (view: View) => void;
};

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'categories', label: 'Budget', icon: Shapes },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
];
const logoUrl = new URL('../../Chiiz logo.png', import.meta.url).href;

export function Sidebar({ activeView, onSelect }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-white">
          <img src={logoUrl} alt="Chiiz logo" className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="font-display text-[1.6rem] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
            Chiiz
          </p>
          <p className="-mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            Smart budgeting
          </p>
        </div>
      </div>

      <div className="flex-1 px-2 py-5">
        <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          Main
        </p>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'}`}
                  strokeWidth={1.6}
                />
                <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          Accounts
        </p>
        <button
          type="button"
          onClick={() => onSelect('settings')}
          className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
            activeView === 'settings'
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <Link2
            className={`h-4 w-4 shrink-0 ${activeView === 'settings' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'}`}
            strokeWidth={1.6}
          />
          <span className={activeView === 'settings' ? 'font-semibold' : ''}>Linked Accounts</span>
        </button>

        <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          Data
        </p>
        <button
          type="button"
          onClick={() => onSelect('upload')}
          className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
            activeView === 'upload'
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <Upload
            className={`h-4 w-4 shrink-0 ${activeView === 'upload' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'}`}
            strokeWidth={1.6}
          />
          <span className={activeView === 'upload' ? 'font-semibold' : ''}>Upload Data</span>
        </button>
      </div>
    </aside>
  );
}
