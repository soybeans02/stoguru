import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
  secondaryCta?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

export function EmptyState({ icon, title, description, cta, secondaryCta, compact }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-16 px-6'
      }`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-[var(--card-bg-soft)] text-[var(--text-tertiary)] flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-[var(--text-primary)] mb-1">{title}</p>
      {description && (
        <p className="text-[13px] text-[var(--text-secondary)] max-w-xs leading-relaxed">{description}</p>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 px-5 py-2 rounded-xl bg-[var(--accent-orange)] text-[var(--text-on-accent)] text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {cta.label}
        </button>
      )}
      {secondaryCta && (
        <button
          onClick={secondaryCta.onClick}
          className="mt-2 px-5 py-2 rounded-xl bg-[var(--card-bg-soft)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-elevated)] transition-colors"
        >
          {secondaryCta.label}
        </button>
      )}
    </div>
  );
}
