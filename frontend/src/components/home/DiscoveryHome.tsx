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
import { SwipeCard } from '../swipe/SwipeCard';
import { navigate } from '../../utils/navigate';
import { loadAllFeatures } from '../../data/features';
import { THEMES, GENRES_AS_THEMES } from '../../data/themes';
import {
  CheckIcon, CheckCircleIcon, StarIcon, CameraIcon, MapPinIcon, MapIcon, CrownIcon, MedalIcon,
  UsersIcon, HelpIcon,
  PlateIcon, BurgerIcon, NoodleIcon, CafeIcon,
} from '../ui/icons';
import type { ComponentType, SVGProps } from 'react';

type SvgIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/* ─────────────────────────────────────
   Types
   ───────────────────────────────────── */
/* テーマ定義：マッチに使うキーワードと表示用メタ */
interface ThemeConfig {
  id: string;
  image: string;
  tag: string;
  title: string;
  desc: string;
  /** feed から絞り込むキーワード（genre/name/description/scene を対象） */
  keywords: string[];
  /** 設定すると /features/{slug} に遷移。未設定なら絞り込みモーダルを開く */
  featureSlug?: string;
}

interface FeedRestaurant extends SwipeRestaurant {
  // optional API extras
  photoUrls?: string[];
  influencerHandle?: string;
  influencerUserId?: string;
  rating?: number;
  stockCount?: number;
}

/* 食べログ風 5 セル検索バーの入力値 */
interface SearchFields {
  area: string;
  name: string;
  genre: string;
  price: string;
  account: string;
}

interface Props {
  onStock: (r: SwipeRestaurant) => void;
  onRemoveStock: (id: string) => void;
  onOpenMap: () => void;
  onOpenSwipe: () => void;
  onOpenAccount?: () => void;
  onOpenSaved?: () => void;
  /** ヒーロー検索で送信されたクエリ。検索画面を呼び出す */
  onSearch?: (q: string) => void;
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
   Main component
   ───────────────────────────────────── */
export function DiscoveryHome({
  onStock,
  onRemoveStock,
  onOpenMap,
  onOpenSwipe,
  onSearch,
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
  const [searchFields, setSearchFields] = useState<SearchFields>({ area: '', name: '', genre: '', price: '', account: '' });
  const submitSearch = (override?: SearchFields) => {
    const f = override ?? searchFields;
    // アカウント検索が入っていれば @ を付けてユーザー寄りに振る
    const composed = f.account.trim()
      ? `@${f.account.trim().replace(/^@/, '')}`
      : [f.area, f.name, f.genre, f.price].map((s) => s.trim()).filter(Boolean).join(' ');
    if (!composed) return;
    onSearch?.(composed);
  };

  // テーマ一覧：microCMS の記事 + fallback を自動取得して並べる。
  // 公開した記事は数分以内にここに自動で出る（loadAllFeatures がキャッシュ管理）
  const [themeConfigs, setThemeConfigs] = useState<ThemeConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadAllFeatures().then((articles) => {
      if (cancelled) return;
      setThemeConfigs(articles.map((a) => ({
        id: a.slug,
        image: a.cardImage || a.heroImage || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
        tag: a.tag,
        title: a.title,
        desc: a.subtitle,
        keywords: [],
        featureSlug: a.slug,
      })));
    });
    return () => { cancelled = true; };
  }, []);

  // テーマカードクリック：feature 記事があれば遷移、なければ絞り込みモーダル
  const handleThemeClick = (th: ThemeConfig) => {
    if (th.featureSlug) {
      navigate(`/features/${th.featureSlug}`);
    } else {
      setSelectedTheme(th);
    }
  };
  const [showHowTo, setShowHowTo] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [previewRestaurant, setPreviewRestaurant] = useState<FeedRestaurant | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | null>(null);

  // Feed
  const [feed, setFeed] = useState<FeedRestaurant[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Ranking
  const [ranking, setRanking] = useState<api.RankedUser[]>([]);
  const [spotRanking, setSpotRanking] = useState<api.RankedSpot[]>([]);

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

  /* Fetch rankings (Top 3 each) */
  useEffect(() => {
    api
      .getStockRanking()
      .then((r) => setRanking(r.slice(0, 3)))
      .catch(() => setRanking([]));
    api
      .getSpotRanking()
      .then((s) => setSpotRanking(s.slice(0, 3)))
      .catch(() => setSpotRanking([]));
  }, []);

  /* 絞り込みは検索バー（5 セル）経由に統一したのでフィードはそのまま表示 */
  const filteredFeed = feed;

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
        searchFields={searchFields}
        onSearchFieldsChange={setSearchFields}
        onSubmitSearch={() => submitSearch()}
        onSignUp={() => setAuthModal('signup')}
        onLogIn={() => setAuthModal('login')}
        onOpenMap={onOpenMap}
        isAnonymous={isAnonymous}
        userNickname={user?.nickname}
      />

      <div className="max-w-[1280px] xl:max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Hero ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-12 items-center py-8 sm:py-10 lg:py-12">
          <div>
            <h1 className="text-[clamp(28px,4.5vw,44px)] font-extrabold leading-[1.15] tracking-[-0.025em] mb-4">
              {t('home.heroTitleA')}
              <br />
              <span style={{ color: 'var(--accent-orange)' }}>{t('home.heroTitleAccent')}</span>
              {t('home.heroTitleB')}
            </h1>
            <p className="text-[14px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed max-w-[460px] mb-5">
              {t('home.heroDescription')}
            </p>
            {/* Tabelog 風 5 セル検索バー（ヒーロー） */}
            <div className="mb-7 max-w-[820px]">
              <MultiFieldSearchBar
                fields={searchFields}
                onChange={setSearchFields}
                onSubmit={() => submitSearch()}
                size="lg"
              />
            </div>
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
                onClick={() => setShowHowTo(true)}
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
              className="absolute bg-[var(--card-bg)] rounded-full px-3.5 py-2 flex items-center gap-1.5 shadow-[var(--shadow-md)] text-[13px] font-semibold"
              style={{ top: '10%', left: '4%' }}
            >
              <CheckCircleIcon size={16} style={{ color: 'var(--visited-green)' }} />
              {t('home.badgeVisited')}
            </div>
            <div
              className="absolute bg-[var(--card-bg)] rounded-full px-3.5 py-2 flex items-center gap-1.5 shadow-[var(--shadow-md)] text-[13px] font-semibold"
              style={{ bottom: '24%', right: 0 }}
            >
              <StarIcon size={14} style={{ color: 'var(--accent-gold)' }} />
              4.8 · 大阪
            </div>
          </div>
        </section>

        {/* ─── テーマで探す（静的・最優先） ─── */}
        <section className="py-10">
          <SectionHead
            title="テーマで探す"
            subtitle="気分に合わせてサクッと探す"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-2">
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => navigate(`/themes/${th.id}`)}
                className="relative aspect-square rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] text-left"
              >
                <img src={th.image} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.1))' }}
                />
                <span
                  className="absolute inset-0 grid place-items-center text-white text-[15px] sm:text-[17px] font-extrabold tracking-[-0.01em] text-center px-2"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.65)' }}
                >
                  {th.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─── ジャンルから探す（画像タイル） ─── */}
        <section className="py-10">
          <SectionHead
            title={t('home.categoriesTitle')}
            subtitle="食べたいジャンルから一気に絞り込む"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 mt-2">
            {GENRES_AS_THEMES.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/themes/${g.id}`)}
                className="relative aspect-square rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] text-left"
              >
                <img src={g.image} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.1))' }}
                />
                <span
                  className="absolute inset-0 grid place-items-center text-white text-[14px] sm:text-[15px] font-extrabold tracking-[-0.01em] text-center px-2"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.65)' }}
                >
                  {g.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─── 特集（CMS 駆動の編集記事） ─── */}
        {themeConfigs.length > 0 && (
          <section className="py-10">
            <SectionHead
              title="特集"
              subtitle="編集部が書いてる、読み物寄りのお店紹介"
              link={themeConfigs.length > 3 ? 'すべて見る →' : undefined}
              onLinkClick={() => setShowThemes(true)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {themeConfigs.slice(0, 3).map((th) => (
                <Story
                  key={th.id}
                  image={th.image}
                  tag={th.tag}
                  title={th.title}
                  desc={th.desc}
                  onClick={() => handleThemeClick(th)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── Spot ranking (保存数の多いお店) ─── */}
        {spotRanking.length > 0 && (
          <section className="py-10">
            <SectionHead
              title={t('home.rankingTitle')}
              subtitle={t('home.rankingSubtitle')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {spotRanking.map((s, idx) => (
                <SpotRankCard
                  key={s.restaurantId}
                  rank={idx + 1}
                  spot={s}
                  bookmarked={stockedIds.includes(s.restaurantId)}
                  visited={visitedIds.includes(s.restaurantId)}
                  onClick={() => setPreviewRestaurant(spotToFeedRestaurant(s))}
                  onBookmark={() => handleBookmark(spotToFeedRestaurant(s))}
                  visitedLabel={t('home.visitedTag')}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── Poster ranking (投稿者) ─── */}
        {ranking.length > 0 && (
          <section className="py-10">
            <SectionHead
              title={t('home.posterRankingTitle')}
              subtitle={t('home.posterRankingSubtitle')}
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

        {/* ─── Restaurant grid ─── */}
        <section className="py-10">
          <SectionHead
            title={t('home.feedTitle')}
            subtitle={t('home.feedSubtitle')}
            link={t('home.feedViewAll')}
            onLinkClick={onOpenSwipe}
          />
          {feedLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {/* スケルトンカード（10 枚） */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-[var(--card-bg)] rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                  <div className="aspect-[4/3] bg-[var(--bg-soft)] animate-pulse" />
                  <div className="p-3.5">
                    <div className="h-3.5 bg-[var(--bg-soft)] rounded animate-pulse w-3/4 mb-2" />
                    <div className="h-2.5 bg-[var(--bg-soft)] rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="py-16 px-6 text-center bg-[var(--card-bg)] rounded-[var(--radius-2xl)] border border-[var(--border)]">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 grid place-items-center"
                style={{ background: 'var(--bg-soft)', color: 'var(--accent-orange)' }}
              >
                <PlateIcon size={28} />
              </div>
              <p className="text-[15px] font-bold mb-1.5">近くにお店が見つかりませんでした</p>
              <p className="text-[12.5px] text-[var(--text-secondary)] mb-5 max-w-[360px] mx-auto">
                エリアを変えるか、スワイプで新しいお店を探してみて。
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={onOpenSwipe}
                  className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                  style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
                >
                  スワイプで探す →
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {filteredFeed.slice(0, 10).map((r) => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  bookmarked={stockedIds.includes(r.id)}
                  visited={visitedIds.includes(r.id)}
                  userPosition={userPosition}
                  onClick={() => setPreviewRestaurant(r)}
                  onBookmark={() => handleBookmark(r)}
                  onInfluencerClick={(uid) => uid && setProfileUserId(uid)}
                  visitedLabel={t('home.visitedTag')}
                />
              ))}
            </div>
          )}
        </section>

        {/* ─── Map preview (compact) ─── */}
        <section className="py-8">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow)] grid grid-cols-1 sm:grid-cols-[1.2fr_1fr] min-h-[180px] sm:min-h-[200px] border border-[var(--border)]">
            <div className="p-5 sm:p-6 flex flex-col justify-center">
              <h3 className="text-[18px] sm:text-[20px] font-extrabold tracking-[-0.015em] mb-1.5">
                {t('home.mapTitle')}
              </h3>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-2 sm:line-clamp-none">
                {t('home.mapDescription')}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
                {[
                  { Icon: MapPinIcon, text: t('home.mapFeature1') },
                  { Icon: MapPinIcon, text: t('home.mapFeature2') },
                  { Icon: MapIcon, text: t('home.mapFeature3') },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
                    <span style={{ color: 'var(--accent-orange)' }}><f.Icon size={12} /></span>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={onOpenMap}
                className="self-start px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
                }}
              >
                {t('home.mapOpen')} →
              </button>
            </div>
            <div
              className="relative min-h-[160px] sm:min-h-full"
              style={{
                background:
                  'linear-gradient(135deg, #e8ebef 25%, transparent 25%, transparent 75%, #e8ebef 75%), linear-gradient(135deg, #e8ebef 25%, transparent 25%, transparent 75%, #e8ebef 75%), #f0f3f6',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 12px 12px',
              }}
            >
              <div className="absolute top-3 left-3 right-3 bg-[var(--card-bg)] rounded-full px-3 py-1.5 flex items-center gap-2 shadow-[var(--shadow-md)] text-[11.5px] font-semibold">
                <span style={{ color: 'var(--visited-green)' }}><MapPinIcon size={13} /></span>
                <span className="truncate">{t('home.mapBanner')}</span>
              </div>
              <MapPin top="40%" left="22%" color="var(--accent-orange)"><BurgerIcon size={12} /></MapPin>
              <MapPin top="55%" left="42%" color="var(--visited-green)"><NoodleIcon size={12} /></MapPin>
              <MapPin top="35%" left="62%" color="var(--accent-orange)"><CafeIcon size={12} /></MapPin>
              <MapPin top="68%" left="68%" color="var(--text-primary)" cluster>12</MapPin>
            </div>
          </div>
        </section>

        {/* ─── App download banner ─── */}
        <AppDownloadBanner />

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
                { label: t('home.footerHowToUse'), href: '/p/how-to' },
                { label: t('home.footerFeatures'), href: '/p/features' },
                { label: t('home.footerPricing'), href: '/p/pricing' },
                { label: t('home.footerDownload'), href: '/p/features' },
              ]}
            />
            <FooterCol
              heading={t('home.footerCompany')}
              items={[
                { label: t('home.footerCareers'), href: '/p/careers' },
                { label: t('home.footerContact'), href: '/p/contact' },
              ]}
            />
            <FooterCol
              heading={t('home.footerOther')}
              items={[
                { label: t('home.footerPrivacy'), href: '/p/privacy' },
                { label: t('home.footerTerms'), href: '/p/terms' },
                { label: t('home.footerLegal'), href: '/p/legal' },
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
      {showHowTo && <HowToGuideModal onClose={() => setShowHowTo(false)} />}
      {showThemes && (
        <ThemesListModal
          themes={themeConfigs}
          onSelectTheme={(th) => { setShowThemes(false); handleThemeClick(th); }}
          onClose={() => setShowThemes(false)}
        />
      )}
      {selectedTheme && (
        <ThemeDetailModal
          theme={selectedTheme}
          feed={feed}
          stockedIds={stockedIds}
          visitedIds={visitedIds}
          userPosition={userPosition}
          visitedLabel={t('home.visitedTag')}
          onPreview={(r) => setPreviewRestaurant(r)}
          onBookmark={handleBookmark}
          onInfluencerClick={(uid) => uid && setProfileUserId(uid)}
          onClose={() => setSelectedTheme(null)}
        />
      )}
      {previewRestaurant && (
        <RestaurantPreviewModal
          restaurant={previewRestaurant}
          userPosition={userPosition}
          bookmarked={stockedIds.includes(previewRestaurant.id)}
          onBookmark={() => {
            handleBookmark(previewRestaurant);
            setPreviewRestaurant(null);
          }}
          onClose={() => setPreviewRestaurant(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────
   Sub components
   ───────────────────────────────────── */

/* 食べログ風 5 セル検索バー（エリア/店名/ジャンル/価格帯/アカウント） */
const PRICE_OPTIONS = ['〜1,000円', '1,000〜3,000円', '3,000〜5,000円', '5,000〜10,000円', '10,000円〜'];

function MultiFieldSearchBar({
  fields,
  onChange,
  onSubmit,
  size = 'md',
}: {
  fields: SearchFields;
  onChange: (next: SearchFields) => void;
  onSubmit: () => void;
  size?: 'md' | 'lg';
}) {
  const set = (key: keyof SearchFields, value: string) => onChange({ ...fields, [key]: value });
  const hasAny = (fields.area || fields.name || fields.genre || fields.price || fields.account).trim().length > 0;
  const cellPad = size === 'lg' ? 'px-3.5' : 'px-3';
  const cellHeight = size === 'lg' ? 'h-11 sm:h-12' : 'h-9 sm:h-10';
  const cellFont = size === 'lg' ? 'text-[13px] sm:text-[14px]' : 'text-[12.5px] sm:text-[13px]';
  const labelFont = size === 'lg' ? 'text-[10px]' : 'text-[9.5px]';
  const btnPad = size === 'lg' ? 'px-5 sm:px-6 h-11 sm:h-12' : 'px-4 sm:px-5 h-9 sm:h-10';
  const btnFont = size === 'lg' ? 'text-[13px] sm:text-[14px]' : 'text-[12.5px] sm:text-[13px]';

  // 各セル：mobile では横スクロール、sm 以上では均等分割
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex items-stretch p-1 rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border-strong)] shadow-[var(--shadow-md)] focus-within:shadow-[var(--shadow-lg)] focus-within:border-[var(--accent-orange)] transition-all overflow-hidden"
    >
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 min-w-0">
        {/* エリア */}
        <Cell label="エリア" first cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <input
            value={fields.area}
            onChange={(e) => set('area', e.target.value)}
            placeholder="渋谷・大阪 など"
            className={`w-full bg-transparent border-0 outline-none ${cellFont} placeholder:text-[var(--text-tertiary)]`}
          />
        </Cell>
        {/* お店の名前 */}
        <Cell label="お店の名前" cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <input
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="店名・キーワード"
            className={`w-full bg-transparent border-0 outline-none ${cellFont} placeholder:text-[var(--text-tertiary)]`}
          />
        </Cell>
        {/* ジャンル */}
        <Cell label="ジャンル" cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <select
            value={fields.genre}
            onChange={(e) => set('genre', e.target.value)}
            className={`w-full bg-transparent border-0 outline-none ${cellFont} appearance-none cursor-pointer pr-3 ${fields.genre ? '' : 'text-[var(--text-tertiary)]'}`}
            style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
          >
            <option value="">指定しない</option>
            {GENRES_AS_THEMES.map((g) => (
              <option key={g.id} value={g.label}>{g.label}</option>
            ))}
          </select>
        </Cell>
        {/* 価格帯 */}
        <Cell label="価格帯" cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <select
            value={fields.price}
            onChange={(e) => set('price', e.target.value)}
            className={`w-full bg-transparent border-0 outline-none ${cellFont} appearance-none cursor-pointer pr-3 ${fields.price ? '' : 'text-[var(--text-tertiary)]'}`}
            style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
          >
            <option value="">指定しない</option>
            {PRICE_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Cell>
        {/* アカウント */}
        <Cell label="アカウント" cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont} last>
          <input
            value={fields.account}
            onChange={(e) => set('account', e.target.value)}
            placeholder="@username"
            className={`w-full bg-transparent border-0 outline-none ${cellFont} placeholder:text-[var(--text-tertiary)]`}
          />
        </Cell>
      </div>
      <button
        type="submit"
        disabled={!hasAny}
        className={`flex-shrink-0 ml-1 ${btnPad} rounded-[var(--radius-lg)] ${btnFont} font-bold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-1.5`}
        style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
        aria-label="検索"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">検索</span>
      </button>
    </form>
  );
}

function Cell({
  label,
  children,
  first,
  last,
  cellHeight,
  cellPad,
  cellFont,
  labelFont,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
  cellHeight: string;
  cellPad: string;
  cellFont: string;
  labelFont: string;
}) {
  // パーティション：左 border で区切る（先頭セル除く）
  return (
    <div
      className={`flex flex-col justify-center ${cellPad} ${cellHeight} ${cellFont} min-w-0 ${first ? '' : 'sm:border-l border-[var(--border)]'} ${last ? 'col-span-2 sm:col-span-1 border-t sm:border-t-0 border-[var(--border)]' : ''}`}
    >
      <span className={`${labelFont} font-bold text-[var(--text-tertiary)] uppercase tracking-[0.04em] mb-0.5 truncate`}>{label}</span>
      {children}
    </div>
  );
}

function DiscoveryTopBar({
  searchFields,
  onSearchFieldsChange,
  onSubmitSearch,
  onSignUp,
  onLogIn,
  onOpenMap,
  isAnonymous,
  userNickname,
}: {
  searchFields: SearchFields;
  onSearchFieldsChange: (f: SearchFields) => void;
  onSubmitSearch?: () => void;
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
      <div className="max-w-[1280px] xl:max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 sm:gap-4">
        {/* PC では左サイドバーに「ストグル」ロゴがあるため、二重化を避けて lg 以上では非表示 */}
        <div
          className="text-[22px] font-extrabold tracking-[-0.02em] hidden sm:block lg:hidden flex-shrink-0"
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
        {/* sm 未満は単一検索（sticky 高さを抑えてモバイルのスクロールカクつき防止）。sm 以上は 5 セル */}
        <div className="flex-1 min-w-0">
          {/* Mobile: 単一の合算検索 */}
          <form
            onSubmit={(e) => { e.preventDefault(); onSubmitSearch?.(); }}
            className="sm:hidden flex items-center gap-2 pl-3.5 pr-1 h-10 rounded-full bg-[var(--bg-soft)] border border-transparent focus-within:bg-[var(--card-bg)] focus-within:border-[var(--accent-orange)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-tertiary)] flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={searchFields.name}
              onChange={(e) => onSearchFieldsChange({ ...searchFields, name: e.target.value })}
              placeholder="お店・エリア・キーワード"
              className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-[var(--text-tertiary)] py-1.5 min-w-0"
            />
            <button
              type="submit"
              disabled={!(searchFields.area || searchFields.name || searchFields.genre || searchFields.price || searchFields.account).trim()}
              className="px-3.5 h-8 rounded-full text-[12.5px] font-bold text-white shadow-[var(--shadow-sm)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              検索
            </button>
          </form>
          {/* sm+: 5 セルパーティション */}
          <div className="hidden sm:block">
            <MultiFieldSearchBar
              fields={searchFields}
              onChange={onSearchFieldsChange}
              onSubmit={() => onSubmitSearch?.()}
              size="md"
            />
          </div>
        </div>
        {/* Right side */}
        <div className="hidden md:flex items-center gap-5 flex-shrink-0">
          {/* PC では左サイドバーに「マップ」タブがあるため、二重化を避けて lg 以上では非表示 */}
          <button
            onClick={onOpenMap}
            className="lg:hidden text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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

/* お店ランキング用カード（保存数の多いお店） */
function SpotRankCard({
  rank,
  spot,
  bookmarked,
  visited,
  onClick,
  onBookmark,
  visitedLabel,
}: {
  rank: number;
  spot: api.RankedSpot;
  bookmarked: boolean;
  visited: boolean;
  onClick: () => void;
  onBookmark: () => void;
  visitedLabel: string;
}) {
  const colors = ['var(--accent-gold)', '#999', '#c47b3a'];
  const photo = (spot.photoUrls && spot.photoUrls[0]) || fallbackPhoto(spot.restaurantId);
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[var(--card-bg)] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] border border-[var(--border)]"
    >
      <div className="aspect-[16/10] relative overflow-hidden bg-[var(--bg-soft)]">
        <img
          src={photo}
          alt={spot.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(spot.restaurantId);
          }}
        />
        <div
          className="absolute top-3 left-3 bg-[var(--card-bg)] text-[14px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-[var(--shadow)]"
          style={{ color: colors[rank - 1] ?? colors[2] }}
        >
          {rank === 1 ? <CrownIcon size={14} /> : <MedalIcon size={14} />} {rank}位
        </div>
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
          {spot.stockCount} saved
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); onBookmark(); }}
          role="button"
          aria-label="bookmark"
          className={`absolute bottom-3 right-3 w-8 h-8 rounded-full grid place-items-center shadow-[var(--shadow-sm)] transition-transform hover:scale-110 cursor-pointer ${
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
        </span>
      </div>
      <div className="px-4 py-3.5">
        <div className="text-[15px] font-bold tracking-[-0.01em] truncate" title={spot.name}>
          {spot.name}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] mt-1 flex-wrap">
          {spot.genres?.[0] && <span>{spot.genres[0]}</span>}
          {spot.genres?.[0] && spot.priceRange && <span className="opacity-50">·</span>}
          {spot.priceRange && <span>{spot.priceRange}</span>}
        </div>
        {visited && (
          <span
            className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: 'var(--visited-green)', background: 'rgba(140,199,64,0.12)' }}
          >
            <CheckIcon size={11} /> {visitedLabel}
          </span>
        )}
      </div>
    </button>
  );
}

/* RankedSpot を FeedRestaurant に変換してプレビューモーダルに渡す */
function spotToFeedRestaurant(s: api.RankedSpot): FeedRestaurant {
  return {
    id: s.restaurantId,
    name: s.name,
    address: s.address ?? '',
    lat: 0,
    lng: 0,
    genre: s.genres?.[0] ?? '',
    scene: [],
    priceRange: s.priceRange ?? '',
    distance: '',
    influencer: { name: '', handle: '', platform: 'tiktok' },
    videoUrl: '',
    photoEmoji: '🍽️',
    photoUrls: s.photoUrls,
    genres: s.genres,
  };
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
  const colors = ['var(--accent-gold)', '#999', '#c47b3a'];
  const photo = user.profilePhotoUrl || fallbackPhoto(user.userId);
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[var(--card-bg)] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] border border-[var(--border)]"
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
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)' }}
        />
        <div
          className="absolute top-3 left-3 bg-[var(--card-bg)] text-[14px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-[var(--shadow)]"
          style={{ color: colors[rank - 1] ?? colors[2] }}
        >
          {rank === 1 ? <CrownIcon size={14} /> : <MedalIcon size={14} />} {rank}位
        </div>
      </div>
      <div className="px-4 py-3.5">
        <div className="text-[15px] font-bold tracking-[-0.01em] truncate mb-0.5">
          @{user.nickname}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]">
          <span className="font-semibold tabular-nums" style={{ color: 'var(--accent-orange)' }}>{user.totalStocks}</span>
          <span>件のお店を投稿</span>
        </div>
      </div>
    </button>
  );
}

function Story({
  image,
  tag,
  title,
  desc,
  onClick,
}: {
  image: string;
  tag: string;
  title: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-[var(--radius-xl)] overflow-hidden cursor-pointer shadow-[var(--shadow)] aspect-[4/3] block w-full text-left transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
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
          className="font-bold leading-[1.35] tracking-[-0.01em] mb-1.5 whitespace-pre-line text-[16px] sm:text-[18px]"
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
  onClick,
  onBookmark,
  onInfluencerClick,
  visitedLabel,
}: {
  restaurant: FeedRestaurant;
  bookmarked: boolean;
  visited: boolean;
  userPosition: GPSPosition | null;
  onClick?: () => void;
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
    <div
      onClick={onClick}
      className="group bg-[var(--card-bg)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-sm)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] border border-[var(--border)] cursor-pointer flex flex-col"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-[var(--bg-soft)]">
        <img
          src={photo}
          alt={restaurant.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id);
          }}
        />
        {/* 下端のグラデでキャプション読みやすく */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
        />

        {/* 保存ボタン */}
        <button
          onClick={(e) => { e.stopPropagation(); onBookmark(); }}
          aria-label={bookmarked ? '保存解除' : '保存'}
          className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full grid place-items-center shadow-[var(--shadow-sm)] transition-transform hover:scale-110 ${
            bookmarked ? '' : 'bg-white/92 backdrop-blur'
          }`}
          style={bookmarked ? { background: 'var(--accent-orange)' } : { background: 'rgba(255,255,255,0.92)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={bookmarked ? 'white' : 'none'} stroke={bookmarked ? 'white' : '#1a1a1a'} strokeWidth="2.2">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* 行ったバッジ（左上） */}
        {visited && (
          <span
            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-1 rounded-full text-white shadow-sm"
            style={{ background: 'var(--visited-green)' }}
          >
            <CheckIcon size={10} /> {visitedLabel}
          </span>
        )}

        {/* 写真枚数 */}
        {photoCount > 1 && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/55 backdrop-blur-md text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
            <CameraIcon size={11} /> {photoCount}
          </span>
        )}

        {/* 投稿者ハンドル（左下） */}
        {handle && (
          <button
            onClick={(e) => { e.stopPropagation(); onInfluencerClick(restaurant.influencerUserId); }}
            className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur-md text-white text-[10.5px] font-semibold px-2 py-0.5 rounded-full hover:bg-black/70 transition-colors"
          >
            {handle.startsWith('@') ? handle : `@${handle}`}
          </button>
        )}
      </div>

      <div className="px-3.5 py-3 flex-1 flex flex-col">
        <div
          className="text-[14.5px] font-bold tracking-[-0.01em] leading-snug mb-1.5 line-clamp-1"
          title={restaurant.name}
        >
          {restaurant.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] mb-2 flex-wrap">
          {distance && <span className="font-medium">{distance}</span>}
          {distance && restaurant.genre && <span className="opacity-40">·</span>}
          {restaurant.genre && <span>{restaurant.genre}</span>}
          {restaurant.priceRange && <span className="opacity-40">·</span>}
          {restaurant.priceRange && <span className="text-[var(--text-primary)] font-semibold tabular-nums">{restaurant.priceRange}</span>}
        </div>
        {restaurant.scene && restaurant.scene.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-auto">
            {restaurant.scene.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
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

function FooterCol({ heading, items }: { heading: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-3">
        {heading}
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              onClick={() => navigate(item.href)}
              className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors cursor-pointer text-left"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────
   How-to guide modal
   ───────────────────────────────────── */
function HowToGuideModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const steps: { Icon: SvgIcon; title: string; desc: string; details: string[] }[] = [
    {
      Icon: BurgerIcon,
      title: t('home.howStep1Title'),
      desc: t('home.howStep1Desc'),
      details: [
        t('home.howStep1Detail1'),
        t('home.howStep1Detail2'),
        t('home.howStep1Detail3'),
      ],
    },
    {
      Icon: CheckCircleIcon,
      title: t('home.howStep2Title'),
      desc: t('home.howStep2Desc'),
      details: [
        t('home.howStep2Detail1'),
        t('home.howStep2Detail2'),
        t('home.howStep2Detail3'),
      ],
    },
    {
      Icon: MapPinIcon,
      title: t('home.howStep3Title'),
      desc: t('home.howStep3Desc'),
      details: [
        t('home.howStep3Detail1'),
        t('home.howStep3Detail2'),
        t('home.howStep3Detail3'),
      ],
    },
    {
      Icon: StarIcon,
      title: t('home.howStep4Title'),
      desc: t('home.howStep4Desc'),
      details: [
        t('home.howStep4Detail1'),
        t('home.howStep4Detail2'),
        t('home.howStep4Detail3'),
      ],
    },
    {
      Icon: UsersIcon,
      title: t('home.howStep5Title'),
      desc: t('home.howStep5Desc'),
      details: [
        t('home.howStep5Detail1'),
        t('home.howStep5Detail2'),
        t('home.howStep5Detail3'),
      ],
    },
  ];
  const faqs = [
    { q: t('home.howFaq1Q'), a: t('home.howFaq1A') },
    { q: t('home.howFaq2Q'), a: t('home.howFaq2A') },
    { q: t('home.howFaq3Q'), a: t('home.howFaq3A') },
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] max-w-[600px] w-full max-h-[90vh] overflow-auto shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--card-bg)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">{t('home.howToTitle')}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--bg-soft)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pt-5 pb-2">
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
            {t('home.howIntro')}
          </p>
        </div>
        <div className="p-6 space-y-6">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-12 h-12 rounded-2xl grid place-items-center"
                  style={{ background: 'var(--bg-soft)', color: 'var(--accent-orange)' }}
                >
                  <s.Icon size={22} />
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 mt-2" style={{ background: 'var(--border)' }} />
                )}
              </div>
              <div className="flex-1 pb-2">
                <div className="text-[15px] font-bold mb-1">{i + 1}. {s.title}</div>
                <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-2.5">{s.desc}</div>
                <ul className="space-y-1.5">
                  {s.details.map((d, j) => (
                    <li key={j} className="flex items-start gap-2 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                      <CheckIcon
                        size={14}
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: 'var(--accent-orange)' }}
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        {/* FAQ */}
        <div className="px-6 pb-6">
          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2 mb-4">
              <HelpIcon size={18} style={{ color: 'var(--accent-orange)' }} />
              <h3 className="text-[15px] font-extrabold tracking-[-0.01em]">{t('home.howFaqTitle')}</h3>
            </div>
            <div className="space-y-3">
              {faqs.map((f, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-md)] px-4 py-3"
                  style={{ background: 'var(--bg-soft)' }}
                >
                  <div className="text-[13.5px] font-bold mb-1">Q. {f.q}</div>
                  <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────
   App download banner (Retty スタイル)
   ───────────────────────────────────── */
function AppDownloadBanner() {
  const { t } = useTranslation();
  // TODO: 実際の App Store / Play Store URL に差し替え
  const APP_STORE_URL = '#';
  const PLAY_STORE_URL: string | null = null;

  return (
    <section className="py-10">
      <div
        className="relative rounded-[var(--radius-2xl)] overflow-hidden shadow-[var(--shadow-lg)]"
        style={{
          background: 'linear-gradient(135deg, var(--accent-orange-grad-1) 0%, var(--accent-orange-grad-2) 100%)',
        }}
      >
        {/* 装飾の光ボケ（白） */}
        <div
          className="absolute -top-20 -right-10 w-80 h-80 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -left-16 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
        />

        <div className="relative grid grid-cols-1 md:grid-cols-[1.4fr_auto] gap-6 md:gap-10 items-center px-6 sm:px-10 md:px-12 py-10 md:py-12">
          {/* 左：アイコン + テキスト */}
          <div className="text-white flex items-start gap-5">
            <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-[20px] bg-white/15 backdrop-blur-md grid place-items-center shadow-lg flex-shrink-0">
              <img src="/app-icon.png" alt="" className="w-full h-full rounded-[20px] object-cover" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-80 mb-1.5">app</p>
              <h3 className="text-[22px] sm:text-[26px] md:text-[30px] font-extrabold tracking-[-0.02em] leading-tight mb-2">
                {t('home.appBannerTitle')}
              </h3>
              <p className="text-[13px] sm:text-[14px] leading-relaxed text-white/85 max-w-[420px]">
                {t('home.appBannerSubtitle')}
              </p>
            </div>
          </div>

          {/* 右：バッジ群 */}
          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="flex flex-wrap gap-2.5">
              <AppStoreBadge href={APP_STORE_URL} t={t} />
              <PlayStoreBadge href={PLAY_STORE_URL} t={t} />
            </div>
            <p className="text-[11.5px] text-white/70 font-medium">
              {t('home.appBannerCTA')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AppStoreBadge({ href, t }: { href: string; t: (k: string) => string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 bg-black text-white px-3.5 py-2 rounded-[10px] hover:bg-gray-900 transition-colors"
      aria-label="Download on the App Store"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.523 12.78c-.04-3.276 2.673-4.866 2.794-4.94-1.523-2.226-3.892-2.531-4.738-2.567-2.014-.205-3.93 1.18-4.95 1.18-1.022 0-2.6-1.151-4.275-1.119-2.198.033-4.226 1.276-5.358 3.246-2.286 3.965-.585 9.83 1.638 13.045 1.087 1.575 2.382 3.345 4.075 3.281 1.638-.066 2.255-1.061 4.235-1.061 1.97 0 2.541 1.061 4.275 1.025 1.768-.029 2.886-1.6 3.964-3.18 1.247-1.823 1.762-3.587 1.79-3.677-.039-.018-3.42-1.31-3.45-5.233zM14.286 3.04c.905-1.097 1.515-2.621 1.348-4.139-1.305.053-2.886.868-3.823 1.965-.84.97-1.575 2.519-1.378 4.012 1.456.112 2.948-.74 3.853-1.838z"/>
      </svg>
      <div className="flex flex-col leading-tight items-start">
        <span className="text-[9px] font-medium opacity-90">{t('home.appBadgeAppStoreLine1')}</span>
        <span className="text-[14px] font-semibold tracking-tight">{t('home.appBadgeAppStoreLine2')}</span>
      </div>
    </a>
  );
}

function PlayStoreBadge({ href, t }: { href: string | null; t: (k: string) => string }) {
  const disabled = !href;
  const Wrapper = disabled ? 'div' : 'a';
  const wrapperProps = disabled
    ? { 'aria-disabled': true as const }
    : { href: href as string, target: '_blank', rel: 'noopener noreferrer' as const, 'aria-label': 'Get it on Google Play' };
  return (
    <Wrapper
      {...(wrapperProps as Record<string, unknown>)}
      className={`flex items-center gap-2.5 bg-black text-white px-3.5 py-2 rounded-[10px] transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-900'
      }`}
    >
      <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <linearGradient id="gp-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00d4ff"/>
          <stop offset="100%" stopColor="#00a3ff"/>
        </linearGradient>
        <linearGradient id="gp-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffce3d"/>
          <stop offset="100%" stopColor="#ffa825"/>
        </linearGradient>
        <linearGradient id="gp-c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5757"/>
          <stop offset="100%" stopColor="#e6334a"/>
        </linearGradient>
        <linearGradient id="gp-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3eda74"/>
          <stop offset="100%" stopColor="#03b34a"/>
        </linearGradient>
        <path d="M3 2.2v19.6c0 .4.46.65.79.43l10.74-7.04L4.34 1.86A.5.5 0 0 0 3 2.2z" fill="url(#gp-d)"/>
        <path d="M14.53 15.19 17.1 12.6 14.53 9.8 3.83 21.13c-.04.04-.07.09-.09.13z" fill="url(#gp-b)"/>
        <path d="M14.53 9.8 17.1 12.6l3.6-2.05a.55.55 0 0 0 .01-.97L17.1 7.43z" fill="url(#gp-c)"/>
        <path d="M14.53 9.8 3.74 2.07c.02.04.05.09.09.13L14.53 15.19l2.57-2.59z" fill="url(#gp-a)"/>
      </svg>
      <div className="flex flex-col leading-tight items-start">
        <span className="text-[9px] font-medium opacity-90">{t('home.appBadgePlayStoreLine1')}</span>
        <span className="text-[14px] font-semibold tracking-tight">
          {t('home.appBadgePlayStoreLine2')}
          {disabled && (
            <span className="ml-1.5 text-[8.5px] font-medium px-1.5 py-0.5 rounded-full bg-white/20 align-middle">
              {t('home.appBadgeComingSoon')}
            </span>
          )}
        </span>
      </div>
    </Wrapper>
  );
}

/* ─────────────────────────────────────
   Restaurant preview modal — フィードのカードをタップした時に
   スワイプ画面と同じ大きいカードを一時的に表示
   ───────────────────────────────────── */
function RestaurantPreviewModal({
  restaurant,
  userPosition,
  bookmarked,
  onBookmark,
  onClose,
}: {
  restaurant: FeedRestaurant;
  userPosition: GPSPosition | null;
  bookmarked: boolean;
  onBookmark: () => void;
  onClose: () => void;
}) {
  const distance = userPosition
    ? formatDistance(
        distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng),
      )
    : restaurant.distance || '';
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3 w-full max-w-[380px] md:max-w-[440px] lg:max-w-[500px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー：カードの外側に配置して被りを防ぐ */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onBookmark(); }}
            aria-label={bookmarked ? 'Unsave' : 'Save'}
            className={`flex items-center gap-2 px-4 h-10 rounded-full font-semibold text-[13px] backdrop-blur-md transition-colors ${
              bookmarked
                ? 'text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            style={bookmarked ? { background: 'var(--accent-orange)' } : undefined}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={bookmarked ? 'white' : 'none'}
              stroke="white"
              strokeWidth="2"
            >
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {bookmarked ? '保存済み' : '保存'}
          </button>
        </div>

        {/* カード本体 */}
        <div className="relative w-full h-[520px] md:h-[580px] lg:h-[640px]">
          <SwipeCard
            restaurant={restaurant}
            distance={distance}
            onSwipeComplete={() => onClose()}
            active={false}
            preview
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────
   Themes list modal (拡張版エディトリアル)
   ───────────────────────────────────── */
function ThemesListModal({
  themes,
  onSelectTheme,
  onClose,
}: {
  themes: ThemeConfig[];
  onSelectTheme: (th: ThemeConfig) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg)] overflow-auto" onClick={onClose}>
      <div className="max-w-[1200px] mx-auto p-4 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[24px] sm:text-[28px] font-extrabold tracking-[-0.02em]">{t('home.themesAllTitle')}</h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1">{t('home.themesAllSubtitle')}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-full bg-[var(--card-bg)] border border-[var(--border)] hover:bg-[var(--bg-soft)] shadow-[var(--shadow-sm)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((th) => (
            <Story key={th.id} image={th.image} tag={th.tag} title={th.title} desc={th.desc} onClick={() => onSelectTheme(th)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────
   Theme detail modal — テーマに合うお店を一覧表示
   ───────────────────────────────────── */
function ThemeDetailModal({
  theme,
  feed,
  stockedIds,
  visitedIds,
  userPosition,
  visitedLabel,
  onPreview,
  onBookmark,
  onInfluencerClick,
  onClose,
}: {
  theme: ThemeConfig;
  feed: FeedRestaurant[];
  stockedIds: string[];
  visitedIds: string[];
  userPosition: GPSPosition | null;
  visitedLabel: string;
  onPreview: (r: FeedRestaurant) => void;
  onBookmark: (r: FeedRestaurant) => void;
  onInfluencerClick: (uid: string | undefined) => void;
  onClose: () => void;
}) {
  const matched = useMemo(() => {
    const kws = theme.keywords.map((k) => k.toLowerCase());
    return feed.filter((r) => {
      const text = [
        r.name,
        r.genre,
        r.description,
        ...(r.genres ?? []),
        ...(r.scene ?? []),
      ].join(' ').toLowerCase();
      return kws.some((kw) => text.includes(kw));
    }).slice(0, 24);
  }, [theme, feed]);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg)] overflow-auto animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {/* Hero */}
        <div className="relative h-[220px] sm:h-[260px] lg:h-[300px] overflow-hidden">
          <img src={theme.image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.85) 100%)' }} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white grid place-items-center hover:bg-black/60 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <div className="absolute left-4 right-4 bottom-5 sm:left-8 sm:right-8 max-w-[1100px] mx-auto text-white">
            <span
              className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.05em] backdrop-blur-md mb-3"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              {theme.tag}
            </span>
            <h1 className="text-[24px] sm:text-[30px] lg:text-[36px] font-extrabold tracking-[-0.02em] leading-tight whitespace-pre-line">
              {theme.title}
            </h1>
            <p className="text-[13px] sm:text-[14px] opacity-90 leading-relaxed mt-2 max-w-[640px]">{theme.desc}</p>
          </div>
        </div>

        {/* Restaurants */}
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-[18px] sm:text-[20px] font-extrabold tracking-[-0.015em]">マッチしたお店</h2>
            <span className="text-[13px] text-[var(--text-tertiary)]">{matched.length} 件</span>
          </div>
          {matched.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] text-sm bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
              このテーマに合うお店がまだありません
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {matched.map((r) => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  bookmarked={stockedIds.includes(r.id)}
                  visited={visitedIds.includes(r.id)}
                  userPosition={userPosition}
                  onClick={() => onPreview(r)}
                  onBookmark={() => onBookmark(r)}
                  onInfluencerClick={onInfluencerClick}
                  visitedLabel={visitedLabel}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
