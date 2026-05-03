interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  /** segmented (iOS UISegmentedControl 相当) / pills (角丸タグ) */
  variant?: 'segmented' | 'pills';
  /** フル幅で均等分割 */
  fullWidth?: boolean;
  className?: string;
}

/**
 * セグメンテッドコントロール。
 * - segmented: 横並び 1 つの背景の上で active がカード化
 * - pills: 個別ピル形状
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'segmented',
  fullWidth = false,
  className = '',
}: TabsProps<T>) {
  if (variant === 'pills') {
    return (
      <div className={`flex gap-2 ${fullWidth ? 'w-full' : ''} ${className}`}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              onClick={() => onChange(it.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent-orange)] text-[var(--text-on-accent)]'
                  : 'bg-[var(--card-bg-soft)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              } ${fullWidth ? 'flex-1' : ''}`}
            >
              {it.label}
              {it.count !== undefined && (
                <span className={`ml-1 ${active ? 'opacity-80' : 'opacity-60'}`}>{it.count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={`inline-flex p-1 bg-[var(--card-bg-soft)] rounded-[12px] ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={`flex-1 px-4 py-1.5 text-xs font-semibold rounded-[10px] transition-all ${
              active
                ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {it.label}
            {it.count !== undefined && <span className="ml-1 opacity-60">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
