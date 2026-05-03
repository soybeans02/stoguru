import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import type { GPSPosition } from '../../hooks/useGPS';
import * as api from '../../utils/api';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { UserProfileModal } from '../user/UserProfileModal';
import { AuthModal } from '../auth/AuthModal';

/* ─────────────────────────────────────
   Types
   ───────────────────────────────────── */
interface FeedRestaurant extends SwipeRestaurant {
  // optional API extras
  photoUrls?: string[];
  influencerHandle?: string;
  influencerUserId?: string;
  rating?: number;
  stockCount?: number;
}

interface Props {
  onStock: (r: SwipeRestaurant) => void;
  onRemoveStock: (id: string) => void;
  onOpenMap: () => void;
  onOpenSwipe: () => void;
  onOpenAccount?: () => void;
  onOpenSaved?: () => void;
  userPosition: GPSPosition | null;
  stockedIds: string[];
  visitedIds: string[];
  refreshKey?: number;
}

/* ─────────────────────────────────────
   Fallback hero photos (Unsplash demo, matches mockup)
   ───────────────────────────────────── */
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
  'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=300',
];

/* Demo photo pool (fallback when API restaurant has no photo) */
const PHOTO_POOL = [
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600',
  'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
  'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600',
];

function fallbackPhoto(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PHOTO_POOL[Math.abs(h) % PHOTO_POOL.length];
}

/* ─────────────────────────────────────
   Categories
   ───────────────────────────────────── */
const CATEGORIES = [
  { id: 'all', emoji: '🍱', i18nKey: 'home.catAll', match: null as string[] | null },
  { id: 'ramen', emoji: '🍜', i18nKey: 'home.catRamen', match: ['ラーメン', 'ramen'] },
  { id: 'sushi', emoji: '🍣', i18nKey: 'home.catSushi', match: ['寿司', 'sushi'] },
  { id: 'burger', emoji: '🍔', i18nKey: 'home.catBurger', match: ['ハンバーガー', 'burger'] },
  { id: 'italian', emoji: '🍝', i18nKey: 'home.catItalian', match: ['イタリアン', 'italian'] },
  { id: 'cafe', emoji: '🍰', i18nKey: 'home.catCafe', match: ['カフェ', 'cafe'] },
  { id: 'yakiniku', emoji: '🥩', i18nKey: 'home.catYakiniku', match: ['焼肉', 'yakiniku'] },
  { id: 'izakaya', emoji: '🍻', i18nKey: 'home.catIzakaya', match: ['居酒屋', 'izakaya'] },
  { id: 'curry', emoji: '🍛', i18nKey: 'home.catCurry', match: ['カレー', 'curry'] },
  { id: 'chinese', emoji: '🥟', i18nKey: 'home.catChinese', match: ['中華', 'chinese'] },
  { id: 'ethnic', emoji: '🌮', i18nKey: 'home.catEthnic', match: ['エスニック', 'ethnic', 'タイ', 'ベトナム', 'メキシカン'] },
];

/* ─────────────────────────────────────
   Main component
   ───────────────────────────────────── */
export function DiscoveryHome({
  onStock,
  onRemoveStock,
  onOpenMap,
  onOpenSwipe,
  userPosition,
  stockedIds,
  visitedIds,
  refreshKey,
}: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAnonymous = !user;
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Feed
  const [feed, setFeed] = useState<FeedRestaurant[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Ranking
  const [ranking, setRanking] = useState<api.RankedUser[]>([]);

  /* Fetch feed */
  useEffect(() => {
    let cancelled = false;
    setFeedLoading(true);
    const lat = userPosition?.lat ?? 34.7025;
    const lng = userPosition?.lng ?? 135.4959;
    api
      .fetchRestaurantFeed(lat, lng, 20000, 40)
      .then((data: FeedRestaurant[]) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setFeed(data);
        } else {
          setFeed(MOCK_RESTAURANTS as FeedRestaurant[]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFeed(MOCK_RESTAURANTS as FeedRestaurant[]);
      })
      .finally(() => {
        if (!cancelled) setFeedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userPosition?.lat, userPosition?.lng, refreshKey]);

  /* Fetch ranking (Top 3 only — drop ties beyond rank 3) */
  useEffect(() => {
    api
      .getStockRanking()
      .then((r) => setRanking(r.slice(0, 3)))
      .catch(() => setRanking([]));
  }, []);

  /* Filter feed by active category */
  const filteredFeed = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat || !cat.match) return feed;
    const m = cat.match;
    return feed.filter((r) => {
      const g = (r.genre || '').toLowerCase();
      return m.some((kw) => g.includes(kw.toLowerCase()));
    });
  }, [feed, activeCategory]);

  /* Handle bookmark click */
  const handleBookmark = (r: FeedRestaurant) => {
    if (isAnonymous) {
      setAuthModal('signup');
      return;
    }
    if (stockedIds.includes(r.id)) {
      onRemoveStock(r.id);
    } else {
      onStock(r);
    }
  };

  /* Hero CTA primary */
  const handleHeroCTA = () => {
    if (isAnonymous) setAuthModal('signup');
    else onOpenSwipe();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)]">
      {/* ─── Top nav (sticky) ─── */}
      <DiscoveryTopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSignUp={() => setAuthModal('signup')}
        onLogIn={() => setAuthModal('login')}
        onOpenMap={onOpenMap}
        isAnonymous={isAnonymous}
        userNickname={user?.nickname}
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Hero ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-center py-10 sm:py-14">
          <div>
            <h1 className="text-[clamp(32px,5vw,48px)] font-extrabold leading-[1.15] tracking-[-0.025em] mb-5">
              {t('home.heroTitleA')}
              <br />
              <span style={{ color: 'var(--accent-orange)' }}>{t('home.heroTitleAccent')}</span>
              {t('home.heroTitleB')}
            </h1>
            <p className="text-[15px] sm:text-[17px] text-[var(--text-secondary)] leading-relaxed max-w-[460px] mb-7">
              {t('home.heroDescription')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleHeroCTA}
                className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              >
                {isAnonymous ? t('home.ctaSignUp') : t('home.ctaStartSwipe')}
              </button>
              <button
                onClick={onOpenSwipe}
                className="px-[22px] py-[11px] rounded-full text-[14px] font-semibold border border-[var(--border-strong)] bg-[var(--card-bg)] shadow-[var(--shadow-sm)] hover:-translate-y-0.5 transition-transform"
              >
                {t('home.ctaHowItWorks')}
              </button>
            </div>
            {/* Stats */}
            <div className="flex gap-6 sm:gap-8 mt-8 pt-6 border-t border-[var(--border)]">
              {[
                { num: '12,400+', label: t('home.statRestaurants') },
                { num: '4,200+', label: t('home.statUsers') },
                { num: '68,000+', label: t('home.statSaves') },
              ].map((s, i) => (
                <div key={i}>
                  <div className="text-[24px] sm:text-[28px] font-extrabold tabular-nums">
                    {s.num}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] mt-0.5">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collage */}
          <div className="relative aspect-[1.05] hidden sm:block">
            <div
              className="absolute rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow-lg)]"
              style={{ width: '58%', height: '70%', top: 0, right: '4%' }}
            >
              <img src={HERO_IMAGES[0]} alt="" className="w-full h-full object-cover" />
            </div>
            <div
              className="absolute rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow-lg)]"
              style={{
                width: '50%',
                height: '50%',
                bottom: '4%',
                left: 0,
                transform: 'rotate(-3deg)',
              }}
            >
              <img src={HERO_IMAGES[1]} alt="" className="w-full h-full object-cover" />
            </div>
            <div
              className="absolute rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow-lg)]"
              style={{
                width: '38%',
                height: '38%',
                bottom: '12%',
                right: '12%',
                transform: 'rotate(4deg)',
              }}
            >
              <img src={HERO_IMAGES[2]} alt="" className="w-full h-full object-cover" />
            </div>

            {/* Floating badges */}
            <div
              className="absolute bg-[var(--card-bg)] rounded-full px-3.5 py-2 flex items-center gap-2 shadow-[var(--shadow-md)] text-[13px] font-semibold"
              style={{ top: '10%', left: '4%' }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--visited-green)' }}
              />
              {t('home.badgeVisited')}
            </div>
            <div
              className="absolute bg-[var(--card-bg)] rounded-full px-3.5 py-2 flex items-center gap-2 shadow-[var(--shadow-md)] text-[13px] font-semibold"
              style={{ bottom: '24%', right: 0 }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--accent-orange)' }}
              />
              4.8 · 大阪
            </div>
          </div>
        </section>

        {/* ─── Categories ─── */}
        <section>
          <SectionHead
            title={t('home.categoriesTitle')}
            subtitle={t('home.categoriesSubtitle')}
          />
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {CATEGORIES.map((c) => {
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`flex-shrink-0 flex items-center gap-2.5 rounded-full pl-2 pr-4 py-1.5 text-[13px] font-semibold border transition-all ${
                    active
                      ? 'bg-[var(--text-primary)] text-[var(--bg)] border-[var(--text-primary)]'
                      : 'bg-[var(--card-bg)] border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow)]'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full grid place-items-center text-[16px] ${
                      active ? 'bg-white/15' : ''
                    }`}
                    style={{ background: active ? 'rgba(255,255,255,0.15)' : 'var(--bg-soft)' }}
                  >
                    {c.emoji}
                  </span>
                  {t(c.i18nKey)}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Ranking ─── */}
        {ranking.length > 0 && (
          <section className="py-10">
            <SectionHead
              title={t('home.rankingTitle')}
              subtitle={t('home.rankingSubtitle')}
              link={t('home.rankingViewAll')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {ranking.map((u, idx) => (
                <RankCard
                  key={u.userId}
                  rank={idx + 1}
                  user={u}
                  onClick={() => setProfileUserId(u.userId)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── Editorial / Themes ─── */}
        <section className="py-10">
          <SectionHead
            title={t('home.editorialTitle')}
            subtitle={t('home.editorialSubtitle')}
            link={t('home.editorialViewAll')}
          />
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr] gap-4 mt-2">
            <Story
              large
              image="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900"
              tag={t('home.editorialTag1')}
              title={t('home.editorialTitle1')}
              desc={t('home.editorialDesc1')}
            />
            <Story
              image="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600"
              tag={t('home.editorialTag2')}
              title={t('home.editorialTitle2')}
              desc={t('home.editorialDesc2')}
            />
            <Story
              image="https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600"
              tag={t('home.editorialTag3')}
              title={t('home.editorialTitle3')}
              desc={t('home.editorialDesc3')}
            />
          </div>
        </section>

        {/* ─── Restaurant grid ─── */}
        <section className="py-10">
          <SectionHead
            title={t('home.feedTitle')}
            subtitle={t('home.feedSubtitle')}
            link={t('home.feedViewAll')}
            onLinkClick={onOpenSwipe}
          />
          {feedLoading ? (
            <div className="py-20 text-center text-[var(--text-tertiary)] text-sm">
              {t('home.feedLoading')}
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-tertiary)] text-sm">
              {t('home.feedEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredFeed.slice(0, 12).map((r) => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  bookmarked={stockedIds.includes(r.id)}
                  visited={visitedIds.includes(r.id)}
                  userPosition={userPosition}
                  onBookmark={() => handleBookmark(r)}
                  onInfluencerClick={(uid) => uid && setProfileUserId(uid)}
                  visitedLabel={t('home.visitedTag')}
                />
              ))}
            </div>
          )}
        </section>

        {/* ─── Map preview ─── */}
        <section className="py-10">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-md)] grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] min-h-[360px] border border-[var(--border)]">
            <div className="p-6 sm:p-8 flex flex-col justify-center">
              <h3 className="text-[22px] sm:text-[24px] font-extrabold tracking-[-0.015em] mb-2.5">
                {t('home.mapTitle')}
              </h3>
              <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-5">
                {t('home.mapDescription')}
              </p>
              <div className="flex flex-col gap-3 mb-6">
                {[
                  { icon: '📍', text: t('home.mapFeature1') },
                  { icon: '🎯', text: t('home.mapFeature2') },
                  { icon: '🗺️', text: t('home.mapFeature3') },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className="w-7 h-7 rounded-lg grid place-items-center"
                      style={{ background: 'var(--bg-soft)' }}
                    >
                      {f.icon}
                    </span>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={onOpenMap}
                className="self-start px-5 py-2.5 rounded-full text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              >
                {t('home.mapOpen')}
              </button>
            </div>
            <div
              className="relative min-h-[280px]"
              style={{
                background:
                  'linear-gradient(135deg, #e8ebef 25%, transparent 25%, transparent 75%, #e8ebef 75%), linear-gradient(135deg, #e8ebef 25%, transparent 25%, transparent 75%, #e8ebef 75%), #f0f3f6',
                backgroundSize: '32px 32px',
                backgroundPosition: '0 0, 16px 16px',
              }}
            >
              <div className="absolute top-4 left-4 right-4 bg-[var(--card-bg)] rounded-[var(--radius-lg)] px-3.5 py-2.5 flex items-center gap-2.5 shadow-[var(--shadow-md)] text-[13px] font-semibold">
                <span style={{ color: 'var(--visited-green)' }}>📍</span>
                {t('home.mapBanner')}
                <span className="ml-auto text-[var(--text-tertiary)] font-normal">2件</span>
              </div>
              <MapPin top="35%" left="22%" color="var(--accent-orange)">🍔</MapPin>
              <MapPin top="48%" left="38%" color="var(--visited-green)">🍜</MapPin>
              <MapPin top="30%" left="55%" color="var(--accent-orange)">☕</MapPin>
              <MapPin top="60%" left="48%" color="var(--accent-purple)">🍝</MapPin>
              <MapPin top="65%" left="68%" color="var(--text-primary)" cluster>12</MapPin>
              <MapPin top="40%" left="75%" color="var(--accent-orange)">🥩</MapPin>
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="mt-10 pt-12 pb-10 border-t border-[var(--border)]">
          <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 lg:gap-10">
            <div>
              <div
                className="text-[22px] font-extrabold tracking-[-0.02em] mb-3"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                stoguru
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-[260px]">
                {t('home.footerTagline')}
              </p>
            </div>
            <FooterCol
              heading={t('home.footerService')}
              items={[
                t('home.footerHowToUse'),
                t('home.footerFeatures'),
                t('home.footerPricing'),
                t('home.footerDownload'),
              ]}
            />
            <FooterCol
              heading={t('home.footerCompany')}
              items={[
                t('home.footerAbout'),
                t('home.footerCareers'),
                t('home.footerContact'),
              ]}
            />
            <FooterCol
              heading={t('home.footerOther')}
              items={[
                t('home.footerPrivacy'),
                t('home.footerTerms'),
                t('home.footerLegal'),
              ]}
            />
          </div>
          <div className="mt-8 pt-6 border-t border-[var(--border)] flex justify-between text-[12px] text-[var(--text-tertiary)]">
            <span>{t('home.footerCopyright')}</span>
            <span>{t('home.footerLove')}</span>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────
   Sub components
   ───────────────────────────────────── */
function DiscoveryTopBar({
  searchQuery,
  onSearchChange,
  onSignUp,
  onLogIn,
  onOpenMap,
  isAnonymous,
  userNickname,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSignUp: () => void;
  onLogIn: () => void;
  onOpenMap: () => void;
  isAnonymous: boolean;
  userNickname?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav
      className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ background: 'color-mix(in srgb, var(--header-bg) 85%, transparent)' }}
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 sm:gap-6">
        <div
          className="text-[22px] font-extrabold tracking-[-0.02em] hidden sm:block"
          style={{
            background:
              'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          stoguru
        </div>
        {/* Search */}
        <div className="flex-1 flex items-center gap-2.5 px-4 py-2 rounded-full bg-[var(--bg-soft)] border border-transparent focus-within:bg-[var(--card-bg)] focus-within:border-[var(--border-strong)] transition-all">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[var(--text-tertiary)]"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-[var(--text-tertiary)]"
          />
        </div>
        {/* Right side */}
        <div className="hidden md:flex items-center gap-5">
          <button
            onClick={onOpenMap}
            className="text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t('home.navMap')}
          </button>
          {isAnonymous ? (
            <>
              <button
                onClick={onLogIn}
                className="text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('auth.logIn')}
              </button>
              <button
                onClick={onSignUp}
                className="px-[18px] py-2 rounded-full text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              >
                {t('home.ctaSignUp')}
              </button>
            </>
          ) : (
            <span className="text-[13px] font-medium text-[var(--text-secondary)] truncate max-w-[140px]">
              @{userNickname}
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}

function SectionHead({
  title,
  subtitle,
  link,
  onLinkClick,
}: {
  title: string;
  subtitle?: string;
  link?: string;
  onLinkClick?: () => void;
}) {
  return (
    <div className="flex items-end justify-between mb-5 gap-4">
      <div>
        <div className="text-[22px] sm:text-[24px] font-extrabold tracking-[-0.015em]">{title}</div>
        {subtitle && (
          <div className="text-[13px] text-[var(--text-tertiary)] mt-1">{subtitle}</div>
        )}
      </div>
      {link && (
        <button
          onClick={onLinkClick}
          className="text-[13px] font-semibold whitespace-nowrap"
          style={{ color: 'var(--accent-orange)' }}
        >
          {link}
        </button>
      )}
    </div>
  );
}

function RankCard({
  rank,
  user,
  onClick,
}: {
  rank: number;
  user: api.RankedUser;
  onClick: () => void;
}) {
  const medals = ['👑', '🥈', '🥉'] as const;
  const colors = ['var(--accent-gold)', '#999', '#c47b3a'];
  const photo = user.profilePhotoUrl || fallbackPhoto(user.userId);
  // Synthesized rating + genre for visual richness (not from API)
  const ratings = ['4.8', '4.6', '4.7'];
  return (
    <button
      onClick={onClick}
      className="text-left bg-[var(--card-bg)] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] border border-[var(--border)]"
    >
      <div className="aspect-[16/10] relative overflow-hidden bg-[var(--bg-soft)]">
        <img
          src={photo}
          alt={user.nickname}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(user.userId);
          }}
        />
        <div
          className="absolute top-3 left-3 bg-[var(--card-bg)] text-[var(--text-primary)] text-[14px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-[var(--shadow)]"
          style={{ color: colors[rank - 1] ?? colors[2] }}
        >
          {medals[rank - 1] ?? '🏅'} {rank}位
        </div>
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
          {user.totalStocks} saved
        </div>
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: 'var(--accent-orange)',
              background: 'rgba(244,128,15,0.1)',
            }}
          >
            グルメ
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--text-secondary)] tabular-nums">
            <span style={{ color: 'var(--accent-gold)' }}>★</span>{' '}
            {ratings[rank - 1] ?? '4.5'}
          </span>
        </div>
        <div className="text-[15px] font-bold tracking-[-0.01em] truncate">
          @{user.nickname}
        </div>
        <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
          フォロー · {user.totalStocks} stocks
        </div>
      </div>
    </button>
  );
}

function Story({
  large,
  image,
  tag,
  title,
  desc,
}: {
  large?: boolean;
  image: string;
  tag: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      className={`relative rounded-[var(--radius-xl)] overflow-hidden cursor-pointer shadow-[var(--shadow)] aspect-[4/3] block w-full text-left ${
        large ? 'lg:row-span-1' : ''
      }`}
    >
      <img src={image} alt="" className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
      <div
        className="absolute inset-0 flex flex-col justify-end p-5 text-white"
        style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%)' }}
      >
        <span
          className="self-start text-[10px] font-bold px-2.5 py-1 rounded-full mb-2.5 uppercase tracking-[0.05em] backdrop-blur-md"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          {tag}
        </span>
        <div
          className={`font-bold leading-[1.35] tracking-[-0.01em] mb-1.5 whitespace-pre-line ${
            large ? 'text-[20px] sm:text-[24px]' : 'text-[16px] sm:text-[18px]'
          }`}
        >
          {title}
        </div>
        <div className="text-[12px] opacity-85 leading-relaxed">{desc}</div>
      </div>
    </button>
  );
}

function RestaurantCard({
  restaurant,
  bookmarked,
  visited,
  userPosition,
  onBookmark,
  onInfluencerClick,
  visitedLabel,
}: {
  restaurant: FeedRestaurant;
  bookmarked: boolean;
  visited: boolean;
  userPosition: GPSPosition | null;
  onBookmark: () => void;
  onInfluencerClick: (uid: string | undefined) => void;
  visitedLabel: string;
}) {
  const photo =
    (restaurant.photoUrls && restaurant.photoUrls[0]) || fallbackPhoto(restaurant.id);
  const photoCount = restaurant.photoUrls?.length ?? 0;
  const handle =
    restaurant.influencerHandle ||
    restaurant.influencer?.handle ||
    null;
  const distance = userPosition
    ? formatDistance(
        distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng),
      )
    : restaurant.distance || '';

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] border border-[var(--border)] cursor-pointer">
      <div className="aspect-square relative overflow-hidden">
        <img
          src={photo}
          alt={restaurant.name}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.04]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id);
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBookmark();
          }}
          aria-label="bookmark"
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full grid place-items-center shadow-[var(--shadow-sm)] transition-transform hover:scale-110 ${
            bookmarked ? '' : 'bg-white/92'
          }`}
          style={
            bookmarked
              ? { background: 'var(--accent-orange)' }
              : { background: 'rgba(255,255,255,0.92)' }
          }
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={bookmarked ? 'white' : 'none'}
            stroke={bookmarked ? 'white' : '#1a1a1a'}
            strokeWidth="2"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        {photoCount > 1 && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/55 backdrop-blur-md text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            📷 {photoCount}
          </span>
        )}
        {handle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInfluencerClick(restaurant.influencerUserId);
            }}
            className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full"
          >
            {handle.startsWith('@') ? handle : `@${handle}`}
          </button>
        )}
      </div>
      <div className="px-3 py-3">
        <div
          className="text-[14px] font-bold tracking-[-0.01em] mb-1 overflow-hidden text-ellipsis whitespace-nowrap"
          title={restaurant.name}
        >
          {restaurant.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] mb-2 flex-wrap">
          {distance && <span>{distance}</span>}
          {distance && restaurant.genre && <span className="opacity-50">·</span>}
          {restaurant.genre && <span>{restaurant.genre}</span>}
          {restaurant.priceRange && <span className="opacity-50">·</span>}
          {restaurant.priceRange && <span>{restaurant.priceRange}</span>}
        </div>
        <div className="flex gap-1 flex-wrap">
          {visited && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(140,199,64,0.15)',
                color: '#5e9023',
              }}
            >
              {visitedLabel}
            </span>
          )}
          {restaurant.scene?.slice(0, 2).map((s) => (
            <span
              key={s}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-soft)] text-[var(--text-secondary)]"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MapPin({
  top,
  left,
  color,
  cluster,
  children,
}: {
  top: string;
  left: string;
  color: string;
  cluster?: boolean;
  children: React.ReactNode;
}) {
  const size = cluster ? 44 : 36;
  return (
    <div
      className="absolute rounded-full border-[3px] border-white shadow-[var(--shadow-md)] grid place-items-center text-white font-bold cursor-pointer transition-transform hover:scale-110"
      style={{
        top,
        left,
        width: size,
        height: size,
        background: color,
        fontSize: cluster ? 16 : 14,
      }}
    >
      {children}
    </div>
  );
}

function FooterCol({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-3">
        {heading}
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item}>
            <a className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors cursor-pointer">
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
