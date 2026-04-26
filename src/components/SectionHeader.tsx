import type { ReactNode } from 'react';

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
