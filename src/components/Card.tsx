import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'soft' | 'elevated';
};

const variants = {
  default:  'bg-[var(--color-surface)] border-[var(--color-border)] shadow-[var(--shadow-sm)]',
  soft:     'bg-[var(--color-surface-alt)] border-transparent shadow-none',
  elevated: 'bg-[var(--color-surface)] border-[var(--color-border)] shadow-[var(--shadow-md)]',
};

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border p-4 transition-shadow duration-200 sm:p-6 ${variants[variant]} ${className}`}
    >
      {children}
    </section>
  );
}
