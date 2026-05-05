import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { findFeature, findRelated } from '../../data/features';
import type { FeatureArticle, FeatureEntry } from '../../data/features';
import { AuthModal } from '../auth/AuthModal';
import { navigate, goBack } from '../../utils/navigate';

interface Props {
  slug: string;
}

export function FeatureArticleScreen({ slug }: Props) {
  const { user } = useAuth();
  const isAnonymous = !user;
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [article, setArticle] = useState<FeatureArticle | null>(null);
  const [related, setRelated] = useState<FeatureArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    findFeature(slug).then(async (a) => {
      if (cancelled) return;
      setArticle(a);
      if (a) {
        const r = await findRelated(a.relatedSlugs);
        if (!cancelled) setRelated(r);
      } else {
        setRelated([]);
      }
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
        <ArticleTopBar
          isAnonymous={isAnonymous}
          onSignUp={() => setAuthModal('signup')}
          onLogIn={() => setAuthModal('login')}
        />
        <div className="flex-1 grid place-items-center px-6 py-20 text-center">
          <p className="text-[14px] text-[var(--text-tertiary)]">読み込み中…</p>
        </div>
        <AuthModal isOpen={authModal !== null} initialMode={authModal ?? 'signup'} onClose={() => setAuthModal(null)} />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
        <ArticleTopBar
          isAnonymous={isAnonymous}
          onSignUp={() => setAuthModal('signup')}
          onLogIn={() => setAuthModal('login')}
        />
        <div className="flex-1 grid place-items-center px-6 py-20 text-center">
          <div>
            <p className="text-[18px] font-bold mb-2">記事が見つかりません</p>
            <p className="text-[13px] text-[var(--text-secondary)]">URL が間違っているか、削除された可能性があります。</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent-orange)' }}
            >
              ホームへ
            </button>
          </div>
        </div>
        <AuthModal isOpen={authModal !== null} initialMode={authModal ?? 'signup'} onClose={() => setAuthModal(null)} />
      </div>
    );
  }

  const handleSave = () => {
    if (isAnonymous) {
      setAuthModal('signup');
      return;
    }
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  return (
    <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)]">
      <ArticleTopBar
        isAnonymous={isAnonymous}
        onSignUp={() => setAuthModal('signup')}
        onLogIn={() => setAuthModal('login')}
      />

      {/* Hero */}
      <header className="relative h-[380px] sm:h-[440px] lg:h-[480px] overflow-hidden">
        <img src={article.heroImage} alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.85)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%)' }} />
        <div className="absolute left-0 right-0 bottom-0 max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-8 pb-10 sm:pb-12 text-white">
          <span className="inline-block text-[10.5px] font-bold tracking-[0.08em] uppercase backdrop-blur-md px-3 py-1.5 rounded-full mb-4" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {article.tag}
          </span>
          <h1 className="text-[28px] sm:text-[36px] lg:text-[44px] font-extrabold leading-[1.15] tracking-[-0.025em] max-w-[760px] mb-3 sm:mb-4">
            {article.title}
          </h1>
          <p className="text-[14px] sm:text-[16px] leading-relaxed opacity-90 max-w-[640px]">
            {article.subtitle}
          </p>
          <div className="flex items-center gap-3.5 mt-5 text-[12.5px] sm:text-[13px] opacity-90 flex-wrap">
            <div
              className="w-9 h-9 rounded-full grid place-items-center font-bold text-[14px]"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              {article.author.initial}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold">{article.author.name}</span>
              <span className="opacity-80 text-[11.5px] mt-0.5">{article.date} · 読了 {article.readMinutes} 分</span>
            </div>
            {article.location && (
              <>
                <div className="w-px h-5 bg-white/30" />
                <span>📍 {article.location}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Article body */}
      <article className="max-w-[760px] mx-auto px-5 sm:px-6 lg:px-8 py-12 lg:py-14">
        {article.intro.map((para, i) => (
          <p
            key={i}
            className={
              i === 0
                ? 'text-[17px] sm:text-[18px] leading-[1.85] mb-7'
                : 'text-[15px] sm:text-[16px] leading-[1.85] mb-5'
            }
          >
            {para}
          </p>
        ))}
        {article.pullQuote && (
          <div
            className="my-8 pl-5 py-1 italic text-[16px] sm:text-[17px]"
            style={{ borderLeft: '3px solid var(--accent-orange)', color: 'var(--text-secondary)' }}
          >
            {article.pullQuote}
          </div>
        )}
        {article.body?.map((para, i) => (
          <p key={i} className="text-[15px] sm:text-[16px] leading-[1.85] mb-5">
            {para}
          </p>
        ))}
      </article>

      {/* Entries */}
      <section className="max-w-[880px] mx-auto px-5 sm:px-6 lg:px-8 pb-20">
        {article.entries.map((entry, i) => (
          <EntryBlock
            key={i}
            entry={entry}
            isFirst={i === 0}
            onSave={handleSave}
          />
        ))}
      </section>

      {/* Closing CTA */}
      <div className="max-w-[760px] mx-auto px-5 sm:px-6 lg:px-8 pb-20 text-center">
        <p className="text-[14px] sm:text-[15px] text-[var(--text-secondary)] mb-5">
          気になったお店は stoguru アプリで保存して、近くを通った時に思い出そう。
        </p>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-[14px] font-bold text-white shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
        >
          {article.closingCTA} →
        </button>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="bg-[var(--bg-soft)] py-14 lg:py-16">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-8">
            <h2 className="text-[22px] sm:text-[24px] font-extrabold tracking-[-0.02em] mb-5">他の特集</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => navigate(`/features/${r.slug}`)}
                  className="relative aspect-[4/3] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] transition-all text-left"
                >
                  <img loading="lazy" src={r.cardImage ?? r.heroImage} alt="" className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                  <div className="absolute inset-0 flex flex-col justify-end p-5 text-white" style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.85) 100%)' }}>
                    <span className="text-[10px] font-bold tracking-[0.05em] uppercase opacity-90">{r.tag}</span>
                    <h3 className="text-[16px] font-bold mt-1 leading-snug">{r.title}</h3>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <FooterStrip />

      {/* Saved toast */}
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--text-primary)] text-[var(--card-bg)] px-5 py-3 rounded-full shadow-[var(--shadow-lg)] text-[13px] font-semibold animate-fade-in">
          ✓ 保存しました
        </div>
      )}

      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}

/* ─── 個別エントリー ─── */
function EntryBlock({ entry, isFirst, onSave }: { entry: FeatureEntry; isFirst: boolean; onSave: () => void }) {
  return (
    <div className={`py-12 sm:py-14 ${isFirst ? '' : 'border-t border-[var(--border-strong)]'}`}>
      <div className="flex items-baseline gap-4 mb-5">
        <span
          className="text-[44px] sm:text-[56px] font-extrabold leading-none tracking-[-0.04em] flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {entry.number}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[22px] sm:text-[26px] font-extrabold tracking-[-0.02em] leading-tight mb-1.5">{entry.name}</h2>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12.5px] text-[var(--text-tertiary)]">
            <span>{entry.location}</span>
            <span className="opacity-50">·</span>
            <span>{entry.genre}</span>
            <span className="opacity-50">·</span>
            <span>{entry.hours}</span>
          </div>
        </div>
      </div>

      <div className="aspect-[16/9] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-md)] mb-5">
        <img loading="lazy" src={entry.photo} alt={entry.name} className="w-full h-full object-cover" />
      </div>

      {entry.comment.map((para, i) => (
        <p key={i} className="text-[15px] sm:text-[16px] leading-[1.85] mb-4">{para}</p>
      ))}

      <div className="bg-[var(--bg-soft)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 sm:p-5 mt-5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 sm:items-center">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
          <InfoItem label="価格帯" value={entry.info.price} />
          <InfoItem label="アクセス" value={entry.info.access} />
          <InfoItem label="座席" value={entry.info.seats} />
          <InfoItem label="予約" value={entry.info.reservation} />
        </div>
        <button
          onClick={onSave}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--card-bg)] border border-[var(--border-strong)] text-[13px] font-semibold hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] hover:-translate-y-0.5 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          保存する
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {entry.tags.map((tg, i) => (
          <span
            key={i}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
          >
            {tg}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[13px] font-semibold">{value}</span>
    </div>
  );
}

/* ─── 共通トップバー ─── */
export function ArticleTopBar({
  isAnonymous,
  onSignUp,
  onLogIn,
}: {
  isAnonymous: boolean;
  onSignUp: () => void;
  onLogIn: () => void;
}) {
  return (
    <nav
      className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ background: 'color-mix(in srgb, var(--header-bg) 88%, transparent)' }}
    >
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 sm:gap-5">
        {/* 戻るボタン */}
        <button
          onClick={goBack}
          aria-label="戻る"
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border-strong)] bg-[var(--card-bg)] hover:bg-[var(--bg-soft)] transition-colors flex-shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-[20px] sm:text-[22px] font-extrabold tracking-[-0.02em]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          stoguru
        </button>
        <div className="flex-1" />
        {isAnonymous ? (
          <>
            <button onClick={onLogIn} className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 sm:px-3 py-2 hidden sm:block">
              ログイン
            </button>
            <button
              onClick={onSignUp}
              className="px-3.5 sm:px-4 py-2 rounded-full text-[12px] sm:text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              新規登録
            </button>
          </>
        ) : (
          <button onClick={() => navigate('/')} className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2">
            ホーム
          </button>
        )}
      </div>
    </nav>
  );
}

/* ─── 共通フッター（記事・静的ページで共有） ─── */
export function FooterStrip() {
  return (
    <footer className="border-t border-[var(--border)] py-10 px-6">
      <div className="max-w-[1100px] mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-[var(--text-tertiary)]">
        <button onClick={() => navigate('/p/contact')} className="hover:text-[var(--accent-orange)] transition-colors">お問い合わせ</button>
        <button onClick={() => navigate('/p/privacy')} className="hover:text-[var(--accent-orange)] transition-colors">プライバシーポリシー</button>
        <button onClick={() => navigate('/p/terms')} className="hover:text-[var(--accent-orange)] transition-colors">利用規約</button>
        <button onClick={() => navigate('/p/legal')} className="hover:text-[var(--accent-orange)] transition-colors">特商法表記</button>
        <span>© 2026 stoguru</span>
      </div>
    </footer>
  );
}
