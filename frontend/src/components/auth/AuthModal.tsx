import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AuthScreen } from './AuthScreen';

interface Props {
  isOpen: boolean;
  initialMode?: 'login' | 'signup';
  onClose: () => void;
}

export function AuthModal({ isOpen, initialMode, onClose }: Props) {
  // Esc で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // スクロールロック
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90svh] sm:max-w-3xl sm:rounded-2xl overflow-hidden bg-white dark:bg-gray-900 shadow-xl">
        <AuthScreen
          initialMode={initialMode}
          onClose={onClose}
          onAuthSuccess={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
