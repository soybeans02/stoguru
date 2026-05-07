import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { findStaticPage } from '../../data/staticPages';
import { AuthModal } from '../auth/AuthModal';
import { ArticleTopBar, FooterStrip } from './FeatureArticleScreen';
import { navigate } from '../../utils/navigate';

interface Props {
  slug: string;
}

export function StaticPageScreen({ slug }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAnonymous = !user;
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);

  const page = findStaticPage(slug);

  return (
    <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
      <ArticleTopBar
        isAnonymous={isAnonymous}
        onSignUp={() => setAuthModal('signup')}
        onLogIn={() => setAuthModal('login')}
      />

      <main className="flex-1 max-w-[760px] w-full mx-auto px-5 sm:px-6 lg:px-8 py-12 lg:py-16">
        {!page ? (
          <div className="py-20 text-center">
            <p className="text-[18px] font-bold mb-2">{t('home.pageNotFound')}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent-orange)' }}
            >
              {t('home.backToHome')}
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-[-0.02em] mb-2">{page.title}</h1>
            {page.subtitle && (
              <p className="text-[14px] text-[var(--text-secondary)] mb-8">{page.subtitle}</p>
            )}
            <div className="border-t border-[var(--border)] pt-6">
              {page.body()}
            </div>
          </>
        )}
      </main>

      <FooterStrip />

      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}
