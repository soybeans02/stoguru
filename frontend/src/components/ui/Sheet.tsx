import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** タブレット以上で中央モーダル化するか（デフォルト true） */
  centeredOnDesktop?: boolean;
  /** ヘッダーを表示するか（タイトル + 閉じるボタン） */
  showHeader?: boolean;
  /** 最大幅 */
  maxWidth?: 'sm' | 'md' | 'lg';
}

const MAX_W: Record<NonNullable<SheetProps['maxWidth']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
};

/**
 * 下から出るボトムシート (mobile) / 中央モーダル (desktop) 兼用。
 * iOS の sheet/modal 相当。
 */
export function Sheet({
  isOpen,
  onClose,
  title,
  children,
  centeredOnDesktop = true,
  showHeader = true,
  maxWidth = 'md',
}: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement as HTMLElement;
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      el?.focus();
    });
    return () => previousFocus.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const positionCls = centeredOnDesktop
    ? 'flex items-end sm:items-center justify-center'
    : 'flex items-end justify-center';

  const cardCls = centeredOnDesktop
    ? `w-full ${MAX_W[maxWidth]} rounded-t-[22px] sm:rounded-[22px]`
    : `w-full ${MAX_W[maxWidth]} rounded-t-[22px]`;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] ${positionCls} animate-fade-in`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className={`relative bg-[var(--card-bg)] text-[var(--text-primary)] ${cardCls} max-h-[92vh] overflow-y-auto shadow-[var(--shadow-lg)] animate-slide-up`}
      >
        {/* drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>
        {showHeader && (
          <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-5">
            <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full hover:bg-[var(--card-bg-soft)] flex items-center justify-center text-[var(--text-tertiary)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
