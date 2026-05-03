import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** アクセシビリティのためのラベル (必須) */
  ariaLabel: string;
  variant?: 'ghost' | 'soft' | 'solid';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--card-bg-soft)]',
  soft: 'bg-[var(--card-bg-soft)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
  solid: 'bg-[var(--accent-orange)] text-[var(--text-on-accent)] hover:opacity-90',
} as const;

const sizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
} as const;

export function IconButton({
  children,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      type={props.type ?? 'button'}
      className={`inline-flex items-center justify-center rounded-full transition-colors active:scale-95 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
