import { useState, type ReactNode } from 'react';
import { AuthModal } from './AuthModal';
import { useTranslation } from '../../context/LanguageContext';

interface Props {
  /** Bookmark / user / lock 等のアイコン (svg) */
  icon?: ReactNode;
  /** "Save your favorites" など */
  title: string;
  /** 補足説明 */
  description: string;
}

function DefaultBookmarkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

/**
 * 匿名ユーザー向けに「Sign up / Log in」を促す再利用可能なゲート画面。
 * 保存タブ・アカウントタブで未ログイン時に表示する想定。
 */
export function SignUpGate({ icon, title, description }: Props) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<null | 'signup' | 'login'>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-[var(--bg)] text-center">
      <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-950/40 text-[var(--accent-orange)] flex items-center justify-center mb-5">
        {icon ?? <DefaultBookmarkIcon />}
      </div>
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">{title}</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs mb-8 leading-relaxed">
        {description}
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => setModal('signup')}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--accent-orange-grad-1)] to-[var(--accent-orange-grad-2)] hover:opacity-90 text-[var(--text-on-accent)] text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
        >
          {t('auth.signUp')}
        </button>
        <button
          onClick={() => setModal('login')}
          className="w-full py-3 rounded-xl bg-[var(--card-bg-soft)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          {t('auth.logIn')}
        </button>
      </div>

      <p className="text-xs text-[var(--text-tertiary)] mt-6">
        {t('auth.alreadyHaveAccount')}{' '}
        <button
          onClick={() => setModal('login')}
          className="text-[var(--accent-orange)] font-medium hover:underline"
        >
          {t('auth.logIn')}
        </button>
      </p>

      <AuthModal
        isOpen={modal !== null}
        initialMode={modal ?? 'signup'}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
