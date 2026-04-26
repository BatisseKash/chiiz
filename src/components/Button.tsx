import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
};

const variants = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)] hover:shadow-[0_4px_14px_rgba(45,204,143,0.35)] hover:-translate-y-px',
  secondary:
    'bg-[var(--color-surface-alt)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-border)]',
  ghost:
    'bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]',
};

export function Button({
  children,
  className = '',
  variant = 'secondary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold font-body transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
