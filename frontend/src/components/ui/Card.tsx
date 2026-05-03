import type { HTMLAttributes, ReactNode } from 'react';

type Padding = 'none' | 'sm' | 'md' | 'lg';
type Radius = 'md' | 'lg' | 'xl' | '2xl';

const paddings: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const radii: Record<Radius, string> = {
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
  xl: 'rounded-[var(--radius-xl)]',
  '2xl': 'rounded-[var(--radius-2xl)]',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: Padding;
  radius?: Radius;
  /** ソフト背景（メニュー用） */
  soft?: boolean;
  /** 影なしのフラットスタイル */
  flat?: boolean;
}

export function Card({
  children,
  padding = 'md',
  radius = 'lg',
  soft = false,
  flat = false,
  className = '',
  ...rest
}: CardProps) {
  const bg = soft ? 'bg-[var(--card-bg-soft)]' : 'bg-[var(--card-bg)]';
  const shadow = flat ? '' : 'shadow-[var(--shadow-sm)]';
  return (
    <div
      className={`${bg} border border-[var(--border)] ${radii[radius]} ${paddings[padding]} ${shadow} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
