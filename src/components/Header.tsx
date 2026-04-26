import { LogOut } from 'lucide-react';
import type { AuthUser, View } from '../types';
import { Button } from './Button';

const titles: Record<View, string> = {
  dashboard:    'Dashboard',
  categories:   'Categories',
  transactions: 'Transactions',
  performance:  'Performance',
  settings:     'Settings',
  upload:       'Upload Data',
};

type HeaderProps = {
  activeView: View;
  currentUser: AuthUser;
  onSignOut: () => void;
};

export function Header({ activeView, currentUser, onSignOut }: HeaderProps) {
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            Chiiz
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
            {titles[activeView]}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{today}</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {[currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || 'Chiiz user'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">{currentUser.email}</p>
          </div>
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
