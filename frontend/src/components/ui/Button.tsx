import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-orange)] text-[var(--text-on-accent)] hover:opacity-90 active:opacity-80 shadow-sm',
  secondary:
    'bg-[var(--card-bg-soft)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]',
  destructive:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  // legacy alias
  danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--card-bg-soft)]',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-sm',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: Props) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform';
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
