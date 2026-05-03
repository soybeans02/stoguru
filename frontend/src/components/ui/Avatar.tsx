import type { ReactNode } from 'react';

interface AvatarProps {
  src?: string;
  emoji?: string;
  name?: string;
  /** ピクセルサイズ */
  size?: number;
  /** グラデリングを表示 (Instagram 風) */
  gradient?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  fallback?: ReactNode;
}

/**
 * アバター。グラデリング (gradient) を付けると Instagram 風の囲みになる。
 */
export function Avatar({
  src,
  emoji,
  name,
  size = 44,
  gradient = false,
  onClick,
  ariaLabel,
  fallback,
}: AvatarProps) {
  const initials = name
    ? name.trim().slice(0, 1).toUpperCase()
    : '';
  const inner = (
    <div
      className="rounded-full bg-[var(--card-bg-soft)] overflow-hidden flex items-center justify-center text-[var(--text-secondary)]"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {src ? (
        <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
      ) : emoji ? (
        <span aria-hidden>{emoji}</span>
      ) : initials ? (
        <span className="font-semibold">{initials}</span>
      ) : (
        fallback ?? <span aria-hidden>👤</span>
      )}
    </div>
  );

  const wrapped = gradient ? (
    <div
      className="rounded-full p-[3px] bg-gradient-to-br from-[var(--accent-orange-grad-1)] to-[var(--accent-orange-grad-2)]"
      style={{ width: size + 6, height: size + 6 }}
    >
      <div
        className="rounded-full bg-[var(--bg)] p-[2px]"
        style={{ width: size + 0, height: size + 0 }}
      >
        {inner}
      </div>
    </div>
  ) : (
    inner
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? name}
        className="rounded-full active:scale-95 transition-transform"
      >
        {wrapped}
      </button>
    );
  }
  return wrapped;
}
