import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import type { GPSPosition } from '../../hooks/useGPS';
import * as api from '../../utils/api';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { UserProfileModal } from '../user/UserProfileModal';
import { AuthModal } from '../auth/AuthModal';
import { navigate } from '../../utils/navigate';
import { loadAllFeatures } from '../../data/features';
import { THEMES, GENRES_AS_THEMES } from '../../data/themes';
// `GENRE_PHOTOS` はこのファイル下方で genre keyword → 写真の解決用 const として
// 別途定義しているので、衝突を避けるために import 側は alias で受ける。
import { POPULAR_GENRES, GENRES, GENRE_PHOTOS as ALL_GENRE_PHOTOS } from '../../data/mockRestaurants';
import { localizeGenre as localizeGenreFn, localizeScene as localizeSceneFn, localizeThemeLabel, localizeProperNoun } from '../../utils/labelI18n';
import { loadGoogleMapsPlaces, createPlacesSessionToken } from '../../utils/googleMaps';
import { LogoMark } from '../ui/LogoMark';
import { LegalSheet, type LegalDocType } from '../legal/LegalDocs';
import {
  CheckIcon, CheckCircleIcon, StarIcon, CameraIcon, MapPinIcon, MapIcon,
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

export interface FeedRestaurant extends SwipeRestaurant {
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
  /** Google Places から選択した時のメタ。点（駅/POI）→ 半径 3km、行政区画 → 住所キーワードで絞り込み */
  areaGeo?: {
    lat: number;
    lng: number;
    /** 'point' = 駅/POI（半径 3km）, 'admin' = 県/市/区（住所キーワードマッチ）*/
    kind: 'point' | 'admin';
  };
}

interface Props {
  onStock: (r: SwipeRestaurant) => void;
  onRemoveStock: (id: string) => void;
  onOpenMap: () => void;
  /** プレビューモーダルの「マップで見る」ボタンから呼ばれる。
   *  指定座標にマップ画面で pan する（StockScreen / SwipeScreen と同じ仕組み）。 */
  onShowOnMap?: (lat: number, lng: number) => void;
  onOpenSwipe: () => void;
  onOpenAccount?: () => void;
  onOpenSaved?: () => void;
  /** ヒーロー検索で送信されたクエリ。検索画面を呼び出す。
   *  geo を指定した場合、SocialScreen 側で半径 3km 圏内に絞り込みする。 */
  onSearch?: (q: string, geo?: { lat: number; lng: number; radiusKm: number }) => void;
  /** stoguru ロゴ（topbar / sidebar）タップ時にフィードを再生成 */
  onReload?: () => void;
  userPosition: GPSPosition | null;
  /** 保存済みのお店一覧（パーソナライズランキングに使う） */
  stocks?: Array<{ id: string; genre?: string; genres?: string[]; scene?: string[]; visited?: boolean }>;
  stockedIds: string[];
  visitedIds: string[];
  refreshKey?: number;
}

/* ─────────────────────────────────────
   HERO_IMAGES は HERO_SAMPLE_CARDS（固定見本）に統合済みなので削除。
   ───────────────────────────────────── */

/* Demo photo pool (fallback when API restaurant has no photo).
   ジャンル/店名から推測できるときは genre-aware の写真を返す。
   推測できない時だけ id ハッシュで一般プールから選ぶ。
   これで「BURGER STAND UMEDA なのにパスタ写真」みたいな
   ミスマッチを減らす。 */
// Unsplash には ?h=450&fit=crop&crop=entropy を渡してサーバー側で 4:3 に
// トリミングしてもらう。`object-cover` だけだと natural aspect が portrait の時に
// 上下が均等に削られて、料理の上半分（具材・トッピング）が切れて見える事故が起きる。
const GENRE_PHOTOS: Record<string, string> = {
  burger:    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=450&fit=crop&crop=entropy&q=70',
  ramen:     'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=450&fit=crop&crop=entropy&q=70',
  sushi:     'https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&h=450&fit=crop&crop=entropy&q=70',
  italian:   'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&h=450&fit=crop&crop=entropy&q=70',
  cafe:      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=600&h=450&fit=crop&crop=entropy&q=70',
  yakiniku:  'https://images.unsplash.com/photo-1535473895227-bdecb20fb157?w=600&h=450&fit=crop&crop=entropy&q=70',
  izakaya:   'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&h=450&fit=crop&crop=entropy&q=70',
  chinese:   'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=450&fit=crop&crop=entropy&q=70',
  curry:     'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&h=450&fit=crop&crop=entropy&q=70',
};

const PHOTO_POOL = [
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=450&fit=crop&crop=entropy&q=70',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=450&fit=crop&crop=entropy&q=70',
];

/** 「大阪府大阪市生野区生野西3-1-7」→「大阪市生野区」のように、市区町村まで
 *  だけを取り出してエリア表示用に整える。
 *  - 都道府県は冗長なので外す
 *  - 番地以降（生野西3-1-7 等）も外す
 *  - ローマ字住所など漢字の市区町村が含まれない場合は先頭 12 文字で切る */
function extractArea(address: string): string {
  if (!address) return '';
  // 都道府県プレフィックスを取り除く（e.g.「大阪府」「東京都」）
  const stripped = address.replace(/^[^都道府県]{1,5}[都道府県]/, '').trim() || address;
  // 「市町村」+ 「区」の組み合わせをまず試す（大阪市生野区, 京都市東山区 など）
  const m = stripped.match(/^(.+?[市町村区])(.+?区)?/);
  if (m) return m[1] + (m[2] ?? '');
  // 漢字 admin が無いとき（ローマ字住所など）は先頭を簡潔に
  return stripped.length > 12 ? stripped.slice(0, 12) + '…' : stripped;
}

function fallbackPhoto(id: string, hint?: { name?: string; genre?: string }): string {
  const text = `${hint?.genre ?? ''} ${hint?.name ?? ''}`.toLowerCase();
  if (/burger|ハンバーガー|バーガー/.test(text)) return GENRE_PHOTOS.burger;
  if (/ramen|ラーメン|つけ麺|中華そば/.test(text)) return GENRE_PHOTOS.ramen;
  if (/sushi|寿司|鮨|すし/.test(text)) return GENRE_PHOTOS.sushi;
  if (/italian|pasta|pizza|イタリアン|パスタ|ピッツァ|ピザ/.test(text)) return GENRE_PHOTOS.italian;
  if (/cafe|coffee|カフェ|コーヒー|喫茶/.test(text)) return GENRE_PHOTOS.cafe;
  if (/yakiniku|焼肉|ホルモン/.test(text)) return GENRE_PHOTOS.yakiniku;
  if (/izakaya|居酒屋|バル/.test(text)) return GENRE_PHOTOS.izakaya;
  if (/chinese|中華|点心|小籠包/.test(text)) return GENRE_PHOTOS.chinese;
  if (/curry|カレー|インド|ネパール/.test(text)) return GENRE_PHOTOS.curry;
  // hint で当たらない時は id ハッシュで一般プールから選ぶ
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PHOTO_POOL[Math.abs(h) % PHOTO_POOL.length];
}

/** 同じ key で同じ値を返す決定的な疑似乱数 [0, 1)。
 *  refreshKey と restaurantId を組み合わせると、リロードごとに順序がバラつく。 */
function pseudoRandom(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* ─────────────────────────────────────
   Main component
   ───────────────────────────────────── */
export function DiscoveryHome({
  onStock,
  onRemoveStock,
  onOpenMap,
  onShowOnMap,
  onOpenSwipe,
  onSearch,
  onReload,
  userPosition,
  stocks,
  stockedIds,
  visitedIds,
  refreshKey,
}: Props) {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const isAnonymous = !user;
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [searchFields, setSearchFields] = useState<SearchFields>({ area: '', name: '', genre: '', price: '', account: '' });
  const submitSearch = (override?: SearchFields) => {
    const f = override ?? searchFields;
    // アカウント検索が入っていれば @ を付けてユーザー寄りに振る
    if (f.account.trim()) {
      onSearch?.(`@${f.account.trim().replace(/^@/, '')}`);
      return;
    }
    // エリアが「点」（駅/POI）の場合：エリアラベルはキーワードに含めず geo で絞り込み。
    // 「行政区画」（県/市/区）の場合：住所マッチが効くようキーワードに含める。
    const isPoint = f.areaGeo?.kind === 'point';
    const keywordParts = [isPoint ? '' : f.area, f.name, f.genre, f.price]
      .map((s) => s.trim())
      .filter(Boolean);
    const keyword = keywordParts.join(' ');
    const geo = isPoint && f.areaGeo
      ? { lat: f.areaGeo.lat, lng: f.areaGeo.lng, radiusKm: 3 }
      : undefined;
    if (!keyword && !geo) return;
    onSearch?.(keyword, geo);
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
        image: a.cardImage || a.heroImage || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400',
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
  const [legalPanel, setLegalPanel] = useState<LegalDocType | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  // 「ジャンルから探す」セクションの右上 → ボタンで開く全件モーダル。
  // 食べログ / Retty 風：人気 8 タイル + flat な全件チップ。
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [previewRestaurant, setPreviewRestaurant] = useState<FeedRestaurant | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | null>(null);

  // Feed
  const [feed, setFeed] = useState<FeedRestaurant[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Ranking
  const [ranking, setRanking] = useState<api.RankedUser[]>([]);
  const [spotRanking, setSpotRanking] = useState<api.RankedSpot[]>([]);

  // Public stats（hero 下の「12,400+ 登録店」等。実数値に置き換え）
  const [publicStats, setPublicStats] = useState<api.PublicStats>({
    restaurants: 0, users: 0, stocks: 0, approximate: true,
  });
  useEffect(() => {
    let cancelled = false;
    api.getPublicStats().then((s) => { if (!cancelled) setPublicStats(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // GPS は watchPosition で高頻度に微小更新が来るので、~1km 粒度に丸めて
  // 「意味のある移動」だけ deps として扱う。サブメートルのジッターで
  // 毎秒フィードを再取得して画面が「リロード」状態になる症状の対策。
  const bucketLat = userPosition ? Math.round(userPosition.lat * 100) / 100 : null;
  const bucketLng = userPosition ? Math.round(userPosition.lng * 100) / 100 : null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketLat, bucketLng, refreshKey]);

  // HeroDeck は固定の見本カード 3 枚を出すので、feed から作るデータは
  // 「ジャンル件数の集計」のみで OK（heroDeckCards は不要になった）。

  /* ジャンルカードに「そのジャンルの投稿件数」を出すための集計。
     feed 上の各レストランを GENRES_AS_THEMES.keywords にマッチさせて数える。
     1 つのレストランが複数ジャンル keyword に該当する場合はそれぞれにカウント。 */
  const genreCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    GENRES_AS_THEMES.forEach((g) => { counts[g.id] = 0; });
    feed.forEach((r) => {
      const gtxt = String(r.genre ?? '').toLowerCase();
      if (!gtxt) return;
      GENRES_AS_THEMES.forEach((g) => {
        const matched = (g.keywords ?? []).some((kw) => gtxt.includes(kw.toLowerCase()));
        if (matched) counts[g.id] += 1;
      });
    });
    return counts;
  }, [feed]);

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

  /* 絞り込みは検索バー（5 セル）経由に統一したのでフィードはそのまま使う。
     ただし「あなたへのおすすめ」として、ユーザーの保存履歴（stocks）の
     ジャンル/シーンに似ているお店を上位に並べ替える。
     さらに refreshKey が変わるたびに同点内でランダムシャッフルしてバリエーションを出す。 */
  const filteredFeed = useMemo(() => {
    if (!feed.length) return feed;
    // ユーザーの嗜好シグナル：visited は stocked より重み 2 倍
    const genreWeight = new Map<string, number>();
    const sceneWeight = new Map<string, number>();
    (stocks ?? []).forEach((s) => {
      const w = s.visited ? 2 : 1;
      const gs = [s.genre, ...(s.genres ?? [])].filter(Boolean) as string[];
      gs.forEach((g) => genreWeight.set(g, (genreWeight.get(g) ?? 0) + w));
      (s.scene ?? []).forEach((sc) => sceneWeight.set(sc, (sceneWeight.get(sc) ?? 0) + w));
    });
    const noPrefs = genreWeight.size === 0 && sceneWeight.size === 0;
    // 既保存はフィードから外して、まだ知らないお店を提案する
    const stockedSet = new Set(stockedIds);
    const candidates = feed.filter((r) => !stockedSet.has(r.id));
    // 嗜好シグナルが無い時は人気とシャッフルだけで並べる（嗜好スコアは
    // 全部 0 になるので、stockBoost と noise しか効かなくなる）
    const scored = candidates.map((r) => {
      const noise = pseudoRandom(`${r.id}:${refreshKey ?? 0}`);
      const stockBoost = Math.log1p(r.stockCount ?? 0) * 0.5;
      if (noPrefs) {
        return { r, score: stockBoost + noise };
      }
      const gs = [r.genre, ...(r.genres ?? [])].filter(Boolean) as string[];
      const genreScore = gs.reduce((acc, g) => acc + (genreWeight.get(g) ?? 0), 0);
      const sceneScore = (r.scene ?? []).reduce((acc, sc) => acc + (sceneWeight.get(sc) ?? 0), 0);
      return { r, score: genreScore * 2 + sceneScore + stockBoost + noise };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.r);
  }, [feed, stocks, stockedIds, refreshKey]);

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
        onOpenSwipe={onOpenSwipe}
        onLogoClick={onReload}
        isAnonymous={isAnonymous}
      />

      {/*
        mobile/tablet: px-4 (16px) で「めり込まず・空きすぎず」のバランス。
        lg 以上: px-8 (32px) でゆとり。
        過去：px-4 sm:px-6 lg:px-8 → 左空きすぎ
              px-3 lg:px-8     → まだ空きすぎ
              px-0 lg:px-8     → めり込む
        現在：px-4 lg:px-8     ← ここに着地
      */}
      <div className="px-4 lg:px-8">
        {/* ─── Hero（Claude Design 風スタックデッキ） ─── */}
        <HeroDeck
          isAnonymous={isAnonymous}
          handleHeroCTA={handleHeroCTA}
          onShowHowTo={() => setShowHowTo(true)}
          tHeroTitleA={t('home.heroTitleA')}
          tHeroTitleAccent={t('home.heroTitleAccent')}
          tHeroTitleB={t('home.heroTitleB')}
          tDescription={t('home.heroDescription')}
          tCtaPrimary={isAnonymous ? t('home.ctaSignUp') : t('home.ctaStartSwipe')}
          tCtaSecondary={t('home.ctaHowItWorks')}
          tStatRestaurants={t('home.statRestaurants')}
          tStatUsers={t('home.statUsers')}
          tStatSaves={t('home.statSaves')}
          statRestaurantsCount={publicStats.restaurants}
          statUsersCount={publicStats.users}
          statSavesCount={publicStats.stocks}
        />

        {/* ─── テーマで探す — Claude Design 風 4:5 アスペクトのオーバーレイカード ─── */}
        <section className="py-12 sm:py-16">
          <SectionHead
            title={t('home.themesTitle')}
            subtitle={t('home.themesSubtitle')}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-3.5 mt-2">
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => navigate(`/themes/${th.id}`)}
                className="relative overflow-hidden cursor-pointer group transition-transform hover:-translate-y-1"
                style={{ aspectRatio: '4 / 5', borderRadius: 16 }}
              >
                <img loading="lazy" src={th.image} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.78) 100%)' }}
                />
                <div
                  className="absolute left-3.5 right-3.5 bottom-3.5 text-white flex items-end justify-between gap-2"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  <span className="text-[15px] sm:text-[16px] font-bold tracking-[-0.01em] leading-[1.2]">{localizeThemeLabel(th.id, th.label, language)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ─── ジャンルから探す — 円形タイル 8 個 + 右上「すべて見る ↗」 ─── */}
        <section className="py-10">
          <SectionHead
            title={t('home.categoriesTitle')}
            subtitle={t('home.categoriesSubtitle')}
            link={t('home.viewAll')}
            onLinkClick={() => setShowAllGenres(true)}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 mt-2">
            {GENRES_AS_THEMES.map((g) => {
              const count = genreCounts[g.id] ?? 0;
              return (
                <a
                  key={g.id}
                  href={`/themes/${g.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/themes/${g.id}`); }}
                  className="flex flex-col items-center gap-2 no-underline group cursor-pointer"
                >
                  {/* 円形画像 + バッジ。バッジは円の overflow:hidden に
                      切られないよう、画像クリップ用 inner div の外に出す。 */}
                  <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                    <div
                      className="absolute inset-0 overflow-hidden transition-all duration-300"
                      style={{
                        borderRadius: '50%',
                        boxShadow: '0 8px 16px -8px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.04)',
                      }}
                    >
                      <img
                        loading="lazy"
                        src={g.image}
                        alt={g.label}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.1]"
                      />
                      {/* hover 時の orange リング（Tailwind variant が CSS 変数効かないので疑似要素 + CSS) */}
                      <span
                        className="absolute inset-0 rounded-full pointer-events-none transition-all"
                        style={{
                          boxShadow: '0 0 0 0 var(--stg-orange-500)',
                        }}
                      />
                    </div>
                    {/* 投稿件数バッジ（右下、白丸 + オレンジ数字）。
                        円の clipping を回避するため inner の外で絶対配置。
                        bottom-right を 6% offset にして円の縁に半分だけ重なる
                        ような Apple Maps 風の見た目に。 */}
                    {count > 0 && (
                      <span
                        className="absolute inline-flex items-center justify-center font-bold"
                        style={{
                          right: '4%',
                          bottom: '4%',
                          minWidth: 26,
                          height: 22,
                          padding: '0 7px',
                          borderRadius: 999,
                          background: 'white',
                          color: 'var(--stg-orange-700)',
                          fontSize: 11,
                          letterSpacing: '-0.01em',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.18), 0 0 0 1.5px rgba(0,0,0,0.04)',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-semibold flex flex-col items-center gap-0.5"
                    style={{ fontSize: 13, color: 'var(--text-primary)' }}
                  >
                    <span>{localizeThemeLabel(g.id, g.label, language)}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {count}{t('home.itemCountSuffix')}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        {/* ─── 特集 — Claude Design 風雑誌レイアウト（1.4fr 1fr 1fr × 2 行、先頭が縦長） ─── */}
        {themeConfigs.length > 0 && (
          <section className="py-12 sm:py-16">
            <SectionHead
              title={t('home.featuresTitle')}
              subtitle={t('home.featuresSubtitle')}
              link={themeConfigs.length > 3 ? t('home.feedViewAll') : undefined}
              onLinkClick={() => setShowThemes(true)}
            />
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
              }}
            >
              <div
                className="grid gap-4 lg:gap-[18px] hidden lg:grid"
                style={{
                  gridTemplateColumns: '1.4fr 1fr 1fr',
                  gridTemplateRows: '280px 280px',
                }}
              >
                {themeConfigs.slice(0, 5).map((th, idx) => (
                  <Story
                    key={th.id}
                    image={th.image}
                    tag={th.tag}
                    title={th.title}
                    desc={th.desc}
                    big={idx === 0}
                    tagVariant={idx === 0 ? 'orange' : idx % 3 === 1 ? 'purple' : 'dark'}
                    onClick={() => handleThemeClick(th)}
                  />
                ))}
              </div>
              {/* 〜lg: 通常のグリッド。
                  Story button は内部が全部 absolute なので、grid-template-rows
                  を指定しないとカード高さが 0 に潰れて見えなくなる。
                  各セル h-[260px] を強制してカードを描画する。 */}
              <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:h-[260px]">
                {themeConfigs.slice(0, 4).map((th, idx) => (
                  <Story
                    key={th.id}
                    image={th.image}
                    tag={th.tag}
                    title={th.title}
                    desc={th.desc}
                    big={false}
                    tagVariant={idx === 0 ? 'orange' : idx % 3 === 1 ? 'purple' : 'dark'}
                    onClick={() => handleThemeClick(th)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── Spot ranking — Claude Design 風 4 列 ─── */}
        {spotRanking.length > 0 && (
          <section className="py-12 sm:py-16">
            <SectionHead
              title={t('home.rankingTitle')}
              subtitle={t('home.rankingSubtitle')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-[18px]">
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

        {/* ─── Poster ranking — Claude Design 風 5 列 creator-card ─── */}
        {ranking.length > 0 && (
          <section className="py-10">
            <SectionHead
              title={t('home.posterRankingTitle')}
              subtitle={t('home.posterRankingSubtitle')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
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
              <p className="text-[15px] font-bold mb-1.5">{t('home.feedEmptyTitle')}</p>
              <p className="text-[12.5px] text-[var(--text-secondary)] mb-5 max-w-[360px] mx-auto">
                {t('home.feedEmptyHint')}
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={onOpenSwipe}
                  className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                  style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
                >
                  {t('home.feedEmptyCta')}
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
                // 「アプリをダウンロード」は出すアプリがまだ無いので外す。
                // i18n の `home.footerDownload` キーは将来復活時のために残置。
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
                { label: t('home.footerPrivacy'), onClick: () => setLegalPanel('privacy') },
                { label: t('home.footerTerms'), onClick: () => setLegalPanel('terms') },
                { label: t('home.footerCookie'), onClick: () => setLegalPanel('cookie') },
                { label: t('home.footerCommerce'), onClick: () => setLegalPanel('commerce') },
              ]}
            />
          </div>
          <div className="mt-8 pt-6 border-t border-[var(--border)] flex justify-between text-[12px] text-[var(--text-tertiary)]">
            <span>{t('home.footerCopyright')}</span>
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
      {legalPanel && <LegalSheet doc={legalPanel} onClose={() => setLegalPanel(null)} />}
      {showThemes && (
        <ThemesListModal
          themes={themeConfigs}
          onSelectTheme={(th) => { setShowThemes(false); handleThemeClick(th); }}
          onClose={() => setShowThemes(false)}
        />
      )}
      {showAllGenres && (
        <GenreListModal
          onClose={() => setShowAllGenres(false)}
          onSelectGenre={(g) => { setShowAllGenres(false); navigate(`/themes/${encodeURIComponent(g)}`); }}
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
          /* マップで見るは onShowOnMap が親から来ている時だけ機能。
             無い場合は disabled。座標が無いお店（lat/lng = 0）も無効化。 */
          onShowOnMap={
            onShowOnMap && previewRestaurant.lat && previewRestaurant.lng
              ? () => onShowOnMap(previewRestaurant.lat, previewRestaurant.lng)
              : undefined
          }
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
/* 価格帯：1,000 円刻み + 10,000 円〜 */
const PRICE_OPTIONS = [
  '〜1,000円',
  '1,000〜2,000円',
  '2,000〜3,000円',
  '3,000〜4,000円',
  '4,000〜5,000円',
  '5,000〜6,000円',
  '6,000〜7,000円',
  '7,000〜8,000円',
  '8,000〜9,000円',
  '9,000〜10,000円',
  '10,000円〜',
];
/* 検索バーのジャンル <select>。`GENRES`（人気 8 + 残り）をそのまま流用。 */
const GENRE_OPTIONS = [...GENRES];
const SELECT_BG_DATAURI = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>")';
const NO_OUTLINE: React.CSSProperties = { outline: 'none', boxShadow: 'none' };

/* ─────────────────────────────────────
   Hero — Claude Design: スタックデッキ + 浮遊バッジ + アクションリング
   ───────────────────────────────────── */
type HeroDeckProps = {
  isAnonymous: boolean;
  handleHeroCTA: () => void;
  onShowHowTo: () => void;
  tHeroTitleA: string;
  tHeroTitleAccent: string;
  tHeroTitleB: string;
  tDescription: string;
  tCtaPrimary: string;
  tCtaSecondary: string;
  tStatRestaurants: string;
  tStatUsers: string;
  tStatSaves: string;
  /** 実数値（バックエンドの DescribeTable.ItemCount 由来）。
      0 のときは「+」を出さずプレースホルダ「-」を出す。 */
  statRestaurantsCount: number;
  statUsersCount: number;
  statSavesCount: number;
};

/* Hero に出す「見本」カードは固定。ユーザーの feed や mock とは切り離して、
   常に同じ 3 枚を出す（見本としての視覚アンカー）。 */
type HeroSample = {
  id: string;
  name: string;
  priceRange: string;
  area: string;
  scene: string[];
  handle: string;
  image: string;
};
const HERO_SAMPLE_CARDS: HeroSample[] = [
  {
    id: 'sample-1',
    name: 'タコス・エルパソ',
    priceRange: '¥1,500〜¥3,000',
    area: '大阪・北区',
    scene: ['友達', 'デート'],
    handle: '@stoguru',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=70',
  },
  {
    id: 'sample-2',
    name: 'Ocha no Ki',
    priceRange: '¥1,000〜¥1,500',
    area: '京都・東山',
    scene: ['一人', 'カフェ'],
    handle: '@stoguru',
    image: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=70',
  },
  {
    id: 'sample-3',
    name: '焼鳥 たけ',
    priceRange: '¥2,000〜¥4,000',
    area: '東京・恵比寿',
    scene: ['同僚', '飲み'],
    handle: '@stoguru',
    image: 'https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=800&q=70',
  },
];

function HeroDeck({
  handleHeroCTA, onShowHowTo,
  tHeroTitleA, tHeroTitleAccent, tHeroTitleB, tDescription,
  tCtaPrimary, tCtaSecondary,
  tStatRestaurants, tStatUsers, tStatSaves,
  statRestaurantsCount, statUsersCount, statSavesCount,
}: HeroDeckProps) {
  const { t } = useTranslation();
  // ユーザーデータと無関係の「見本」カードを使う。
  const cards = HERO_SAMPLE_CARDS;
  // 数値の表示整形：1000 以上なら "1.2k" 形式、1万以上は "1.2万" 形式。
  // 0 のとき（fetch 前 / 失敗時）は "-" にしてプレースホルダ感を出す。
  const formatStat = (n: number): { num: string; hasPlus: boolean } => {
    if (!n || n <= 0) return { num: '-', hasPlus: false };
    if (n < 1000) return { num: String(n), hasPlus: false };
    if (n < 10000) return { num: (Math.floor(n / 100) / 10).toLocaleString() + 'k', hasPlus: true };
    return { num: (Math.floor(n / 1000) / 10).toLocaleString() + '万', hasPlus: true };
  };
  const restStat = formatStat(statRestaurantsCount);
  const userStat = formatStat(statUsersCount);
  const saveStat = formatStat(statSavesCount);

  // 背景は「左だけ」viewport edge まで延ばす。
  // section に -ml-4 lg:-ml-8 を付けて親の左 padding を打ち消し、左側のみ
  // full-bleed。右側は親の padding 内に収まったまま（右めり込み回避）。
  // 内側 grid に pl-4 lg:pl-8 を付けてテキストの位置は据え置き。
  return (
    <section className="relative py-12 sm:py-16 lg:py-20 overflow-hidden -ml-4 lg:-ml-8">
      {/* 背景グラデ — 左上にだけ暖色グロー（section と一緒に左 full-bleed）*/}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 60% at 12% 0%, rgba(254,141,40,0.12), transparent 60%)',
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,580px)] gap-12 items-center pl-4 lg:pl-8">
        <div>
          {/* eyebrow */}
          <div
            className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.02em] px-3 py-1.5 rounded-full mb-5"
            style={{ color: 'var(--stg-orange-700)', background: 'var(--stg-orange-50)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--stg-orange-500)', boxShadow: '0 0 0 4px rgba(254,141,40,0.15)' }}
            />
            {t('home.heroTag')}
          </div>

          {/* h1 — design では 40-64px clamp。ページ背景に直で乗るので
              theme で色を反転させる必要 → var(--text-primary) を使用。 */}
          <h1
            className="font-extrabold leading-[1.05] tracking-[-0.035em] mb-5"
            style={{ fontSize: 'clamp(36px,5vw,60px)', color: 'var(--text-primary)' }}
          >
            {tHeroTitleA}
            <br />
            <span
              className="not-italic"
              style={{
                background: 'linear-gradient(180deg, #FE9B3A, #E87618)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {tHeroTitleAccent}{tHeroTitleB}
            </span>
          </h1>

          <p
            className="text-[15px] sm:text-[17px] leading-[1.7] mb-7 max-w-[480px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {tDescription}
          </p>

          <div className="flex flex-wrap gap-3 mb-10">
            <button
              onClick={handleHeroCTA}
              className="inline-flex items-center gap-1.5 px-5 sm:px-[22px] py-3 sm:py-3.5 rounded-[14px] text-[14px] sm:text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5"
              style={{
                background: 'var(--stg-orange-500)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 12px rgba(254,141,40,0.32)',
              }}
            >
              {tCtaPrimary}
            </button>
            <button
              onClick={onShowHowTo}
              className="inline-flex items-center gap-2 px-5 py-3 sm:py-3.5 rounded-[14px] text-[14px] sm:text-[15px] font-semibold transition-colors"
              style={{
                /* 白背景なので text は常に dark (stg-ink)。
                   gray-900 を使うと dark mode で白文字 → 不可視になる。 */
                color: 'var(--stg-ink)',
                background: 'white',
                border: '1px solid #E5E5EA',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>
              {tCtaSecondary}
            </button>
          </div>

          {/*
            stats row：narrow viewport でも必ず 1 行で収まるようにする。
            wrap させると見にくいので、font-size を viewport に応じて
            clamp で詰める。3 cell は flex-1 で均等分配、cell 内では
            whitespace-nowrap で数字を崩さない。
          */}
          <div
            className="flex gap-x-3 sm:gap-x-5 lg:gap-x-9 pt-7"
            style={{ borderTop: '1px solid var(--stg-gray-200)', maxWidth: 480 }}
          >
            {[
              { ...restStat, label: tStatRestaurants },
              { ...userStat, label: tStatUsers },
              { ...saveStat, label: tStatSaves },
            ].map((s, i) => (
              <div key={i} className="min-w-0 flex-1">
                <div
                  className="font-extrabold tabular-nums leading-none whitespace-nowrap"
                  style={{ fontSize: 'clamp(18px, 5vw, 28px)', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
                >
                  {s.num}
                  {s.hasPlus && <span style={{ color: 'var(--stg-orange-500)' }}>+</span>}
                </div>
                <div
                  className="mt-1.5"
                  style={{ fontSize: 'clamp(10px, 2.6vw, 12px)', color: 'var(--text-secondary)' }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Deck（3 枚スタック）─── */}
        <div className="relative h-[480px] lg:h-[560px] hidden sm:flex items-center justify-center mt-8 lg:mt-0">
          {/* visited badge — 浮遊 */}
          <div
            className="stg-float-1 absolute z-10 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold"
            style={{ top: 32, left: -10, background: 'white', color: 'var(--stg-ink)', boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }}
          >
            <span
              className="grid place-items-center w-[18px] h-[18px] rounded-full text-white"
              style={{ background: 'var(--stg-green)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            {t('home.visitedTag')}
          </div>

          {/* 3-card stack: --3 (back), --2 (mid), --1 (top) */}
          {cards.map((c, idx) => {
            // top=0 (front)、idx=1 (mid)、idx=2 (back)
            const transform =
              idx === 0 ? 'translate(0, 0) rotate(-2deg)' :
              idx === 1 ? 'translate(60px, -40px) rotate(6deg)' :
                          'translate(-110px, 30px) rotate(-8deg)';
            const z = idx === 0 ? 3 : idx === 1 ? 2 : 1;
            return (
              <div
                key={c.id}
                className="absolute w-[280px] h-[400px] lg:w-[320px] lg:h-[460px] overflow-hidden"
                style={{
                  borderRadius: 26,
                  transform, zIndex: z,
                  boxShadow: '0 30px 60px -20px rgba(60,30,0,0.35), 0 12px 24px -8px rgba(60,30,0,0.20)',
                  background: 'var(--stg-gray-100)',
                  transition: 'transform 600ms var(--stg-ease)',
                }}
              >
                <img src={c.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0 flex flex-col justify-between p-4 text-white"
                  style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)' }}
                >
                  <span
                    className="self-start inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-full backdrop-blur"
                    style={{ background: 'rgba(0,0,0,0.42)' }}
                  >
                    {c.handle}
                  </span>
                  <div>
                    <div
                      className="font-bold text-[20px] lg:text-[22px] tracking-[-0.01em] leading-[1.15] mb-1"
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                    >
                      {c.name}
                    </div>
                    <div className="text-[12px] opacity-90" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                      {c.priceRange}
                    </div>
                    {c.scene.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5">
                        {c.scene.slice(0, 2).map((sc) => (
                          <span
                            key={sc}
                            className="text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur"
                            style={{ background: 'rgba(255,255,255,0.22)' }}
                          >
                            {sc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* rating badge — 浮遊。
              旧 right: -8 だと section の overflow-hidden で右端が clip
              されて「4.8 大阪・北区」が PC で見切れてた。中に寄せる。 */}
          <div
            className="stg-float-2 absolute z-10 inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold"
            style={{ bottom: 32, right: 8, background: 'white', color: 'var(--stg-ink)', borderRadius: 14, boxShadow: '0 12px 30px rgba(0,0,0,0.14)' }}
          >
            <span style={{ color: 'var(--stg-yellow)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 1.4 14 6.7l5.8.8-4.2 4 1 5.7-5.1-2.7L6.4 17.3l1-5.7-4.2-4 5.8-.8z"/></svg>
            </span>
            4.8
            <span className="text-[11px] font-medium" style={{ color: 'var(--stg-ink-muted)' }}>大阪・北区</span>
          </div>

          {/* action ring — 完全に装飾のみ。クリックしても何もしない（noop）。
              type="button" + tabIndex={-1} + pointer-events なし にしてキーボード /
              スクリーンリーダーからもアクションとして見えないようにする。 */}
          <div
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex gap-3.5 z-[9]"
            aria-hidden="true"
            style={{ pointerEvents: 'none' }}
          >
            {[
              { kind: 'undo' as const, color: 'var(--stg-gray-800)', bg: 'white' },
              { kind: 'pass' as const, color: 'var(--stg-red)', bg: 'white' },
              { kind: 'save' as const, color: 'white', bg: 'var(--stg-orange-500)' },
              { kind: 'map' as const, color: 'var(--stg-blue)', bg: 'white' },
            ].map((b) => (
              <span
                key={b.kind}
                className="grid place-items-center rounded-full"
                style={{
                  width: 52, height: 52,
                  background: b.bg, color: b.color,
                  boxShadow: b.kind === 'save' ? '0 8px 18px rgba(254,141,40,0.45)' : '0 8px 18px rgba(0,0,0,0.12)',
                }}
              >
                {b.kind === 'undo' && (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>)}
                {b.kind === 'pass' && (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>)}
                {b.kind === 'save' && (<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>)}
                {b.kind === 'map' && (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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
  const { t, language } = useTranslation();
  const set = (key: keyof SearchFields, value: string) => onChange({ ...fields, [key]: value });
  const hasAny = (fields.area || fields.name || fields.genre || fields.price || fields.account).trim().length > 0;
  const cellPad = size === 'lg' ? 'px-3.5' : 'px-3';
  const cellHeight = size === 'lg' ? 'h-11 sm:h-12' : 'h-9 sm:h-10';
  const cellFont = size === 'lg' ? 'text-[13px] sm:text-[14px]' : 'text-[12.5px] sm:text-[13px]';
  const labelFont = size === 'lg' ? 'text-[10px]' : 'text-[9.5px]';
  const btnPad = size === 'lg' ? 'px-5 sm:px-6 h-11 sm:h-12' : 'px-4 sm:px-5 h-9 sm:h-10';
  const btnFont = size === 'lg' ? 'text-[13px] sm:text-[14px]' : 'text-[12.5px] sm:text-[13px]';

  // ─── Google Places autocomplete（エリア用）───
  // ロードはエリア欄が初めて focus された時のみ。Home を開いただけでは Maps API
  // を呼ばない（API 課金抑制）。
  // sessionToken を 1 検索セッション内で getPlacePredictions / getDetails に
  // 渡すと per-request 課金 → per-session 課金にまとまる。
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [areaSuggestions, setAreaSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);
  const areaTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function ensureMapsLoaded() {
    if (autocompleteService.current) return;
    const g = await loadGoogleMapsPlaces();
    if (!g?.maps?.places) return;
    autocompleteService.current = new g.maps.places.AutocompleteService();
    if (!placesDiv.current) placesDiv.current = document.createElement('div');
    placesService.current = new g.maps.places.PlacesService(placesDiv.current);
  }

  function startNewSession() {
    sessionTokenRef.current = createPlacesSessionToken();
  }

  function handleAreaChange(v: string) {
    // 手動編集すると過去の geo メタは無効化
    onChange({ ...fields, area: v, areaGeo: undefined });
    if (areaTimer.current) clearTimeout(areaTimer.current);
    if (!v.trim()) { setAreaSuggestions([]); setShowAreaSuggestions(false); return; }
    areaTimer.current = setTimeout(() => {
      if (!autocompleteService.current) return;
      if (!sessionTokenRef.current) startNewSession();
      // (regions) に絞ると駅が出ないので type 制限は外す。日本国内のみ。
      autocompleteService.current.getPlacePredictions(
        {
          input: v,
          componentRestrictions: { country: 'jp' },
          language: 'ja',
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setAreaSuggestions(predictions.slice(0, 6));
            setShowAreaSuggestions(true);
          } else {
            setAreaSuggestions([]);
          }
        },
      );
    }, 250);
  }

  // 行政区画タイプ（県/市/区/町/村） — これらが含まれていれば「住所キーワード」マッチ
  const ADMIN_TYPES = new Set([
    'administrative_area_level_1', // 都道府県
    'administrative_area_level_2', // 郡 / 一部の市
    'administrative_area_level_3',
    'locality',                    // 市
    'sublocality_level_1',         // 区
    'sublocality_level_2',
    'postal_code',
    'country',
  ]);

  function pickArea(prediction: google.maps.places.AutocompletePrediction) {
    const label = prediction.structured_formatting?.main_text || prediction.description;
    const short = label.split(/[、,]/)[0].trim();
    setShowAreaSuggestions(false);
    setAreaSuggestions([]);
    if (!placesService.current) {
      // Places SDK が未ロードならジオ無しでテキストだけセット
      onChange({ ...fields, area: short, areaGeo: undefined });
      return;
    }
    const token = sessionTokenRef.current;
    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'types'],
        sessionToken: token ?? undefined,
      },
      (place, status) => {
        // session 終了 — getDetails 後はトークンを破棄して次回新規セッションへ
        sessionTokenRef.current = null;
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          onChange({ ...fields, area: short, areaGeo: undefined });
          return;
        }
        const types = place.types ?? [];
        const isAdmin = types.some((t) => ADMIN_TYPES.has(t));
        onChange({
          ...fields,
          area: short,
          areaGeo: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            kind: isAdmin ? 'admin' : 'point',
          },
        });
      },
    );
  }

  // form は overflow-visible にして、エリア候補ドロップダウンが下にはみ出せるようにする
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex items-stretch p-1 rounded-[var(--radius-xl)] bg-[var(--card-bg)] border border-[var(--border-strong)] shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transition-shadow"
    >
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 min-w-0">
        {/* エリア（Google Places autocomplete 付き） */}
        <Cell label={t('home.cellArea')} first cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <div className="relative w-full">
            <input
              value={fields.area}
              onChange={(e) => handleAreaChange(e.target.value)}
              onFocus={async () => {
                await ensureMapsLoaded();
                // フォーカス時にセッショントークンを発行（getPlacePredictions と
                // 後続の getDetails が同じトークンを使うことで billing が
                // session 単位にまとまる）
                if (!sessionTokenRef.current) startNewSession();
                if (fields.area && areaSuggestions.length > 0) setShowAreaSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 150)}
              placeholder={t('home.cellAreaPlaceholder')}
              className={`w-full bg-transparent border-0 ${cellFont} placeholder:text-[var(--text-tertiary)]`}
              style={NO_OUTLINE}
            />
            {showAreaSuggestions && areaSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-[var(--radius-lg)] bg-[var(--card-bg)] border border-[var(--border)] shadow-[var(--shadow-lg)] py-1 max-h-[260px] overflow-y-auto min-w-[220px]">
                {areaSuggestions.map((p) => (
                  <button
                    key={p.place_id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault() /* blur 抑止 */}
                    onClick={() => pickArea(p)}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--bg-soft)] transition-colors"
                  >
                    <div className="font-semibold truncate">{p.structured_formatting?.main_text || p.description}</div>
                    {p.structured_formatting?.secondary_text && (
                      <div className="text-[11px] text-[var(--text-tertiary)] truncate">{p.structured_formatting.secondary_text}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Cell>
        {/* お店の名前 */}
        <Cell label={t('home.cellName')} cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <input
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('home.cellNamePlaceholder')}
            className={`w-full bg-transparent border-0 ${cellFont} placeholder:text-[var(--text-tertiary)]`}
            style={NO_OUTLINE}
          />
        </Cell>
        {/* ジャンル */}
        <Cell label={t('home.cellGenre')} cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <select
            value={fields.genre}
            onChange={(e) => set('genre', e.target.value)}
            className={`w-full bg-transparent border-0 ${cellFont} appearance-none cursor-pointer pr-3 ${fields.genre ? '' : 'text-[var(--text-tertiary)]'}`}
            style={{ outline: 'none', boxShadow: 'none', backgroundImage: SELECT_BG_DATAURI, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
          >
            <option value="">{t('home.cellGenreUnspecified')}</option>
            {GENRE_OPTIONS.map((g) => (
              <option key={g} value={g}>{localizeGenreFn(g, language)}</option>
            ))}
          </select>
        </Cell>
        {/* 価格帯 */}
        <Cell label={t('home.cellPrice')} cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont}>
          <select
            value={fields.price}
            onChange={(e) => set('price', e.target.value)}
            className={`w-full bg-transparent border-0 ${cellFont} appearance-none cursor-pointer pr-3 ${fields.price ? '' : 'text-[var(--text-tertiary)]'}`}
            style={{ outline: 'none', boxShadow: 'none', backgroundImage: SELECT_BG_DATAURI, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
          >
            <option value="">{t('home.cellPriceUnspecified')}</option>
            {PRICE_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Cell>
        {/* アカウント */}
        <Cell label={t('home.cellAccount')} cellHeight={cellHeight} cellPad={cellPad} cellFont={cellFont} labelFont={labelFont} last>
          <input
            value={fields.account}
            onChange={(e) => set('account', e.target.value)}
            placeholder="@username"
            className={`w-full bg-transparent border-0 ${cellFont} placeholder:text-[var(--text-tertiary)]`}
            style={NO_OUTLINE}
          />
        </Cell>
      </div>
      <button
        type="submit"
        disabled={!hasAny}
        className={`flex-shrink-0 ml-1 ${btnPad} rounded-[var(--radius-lg)] ${btnFont} font-bold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-1.5`}
        style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
        aria-label={t('home.searchBtn')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">{t('home.searchBtn')}</span>
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
  onOpenSwipe,
  onLogoClick,
  isAnonymous,
}: {
  searchFields: SearchFields;
  onSearchFieldsChange: (f: SearchFields) => void;
  onSubmitSearch?: () => void;
  onSignUp: () => void;
  onLogIn: () => void;
  onOpenMap: () => void;
  /** 検索バー左の「スワイプで探す」ショートカット */
  onOpenSwipe?: () => void;
  /** ロゴ（タブレットの "stoguru"）タップでフィードを再生成（パーソナライズ更新） */
  onLogoClick?: () => void;
  isAnonymous: boolean;
}) {
  const { t } = useTranslation();
  return (
    <nav
      className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ background: 'color-mix(in srgb, var(--header-bg) 85%, transparent)' }}
    >
      {/* mobile/tablet: px-4 (16px) — モバイルアプリ標準の余白。
          px-0 だと content が edge に「めり込む」のでこのライン。
          lg 以上は px-8 (32px) でゆとり。 */}
      <div className="px-4 lg:px-8 py-2.5 flex items-center gap-3 sm:gap-4">
        {/* PC では左サイドバーに「ストグル」ロゴがあるため、二重化を避けて lg 以上では非表示。
            タップでホームを再読み込み（おすすめを再生成） */}
        <button
          type="button"
          onClick={() => onLogoClick?.()}
          aria-label={t('home.homeReloadAria')}
          className="text-[22px] font-extrabold tracking-[-0.02em] hidden sm:block lg:hidden flex-shrink-0 hover:opacity-80 transition-opacity"
          style={{
            background:
              'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          stoguru
        </button>
        {/* md (768) 未満は単一検索（sticky 高さを抑えてモバイル/タブレット縦のスクロールカクつき防止 + iPad portrait の 5 セル詰まり対策）。md 以上で 5 セル */}
        <div className="flex-1 min-w-0">
          {/* Mobile / iPad portrait: 単一の合算検索 */}
          <form
            onSubmit={(e) => { e.preventDefault(); onSubmitSearch?.(); }}
            className="md:hidden flex items-center gap-2 pl-3.5 pr-1 h-10 rounded-full bg-[var(--bg-soft)] border border-transparent focus-within:bg-[var(--card-bg)] focus-within:border-[var(--accent-orange)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-tertiary)] flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={searchFields.name}
              onChange={(e) => onSearchFieldsChange({ ...searchFields, name: e.target.value })}
              placeholder={t('home.searchBarPlaceholder')}
              className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-[var(--text-tertiary)] py-1.5 min-w-0"
            />
            <button
              type="submit"
              disabled={!(searchFields.area || searchFields.name || searchFields.genre || searchFields.price || searchFields.account).trim()}
              className="px-3.5 h-8 rounded-full text-[12.5px] font-bold text-white shadow-[var(--shadow-sm)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
            >
              {t('home.searchBtn')}
            </button>
          </form>
          {/* md+: 5 セルパーティション（〜768px は単一検索 fallback） */}
          <div className="hidden md:block">
            <MultiFieldSearchBar
              fields={searchFields}
              onChange={onSearchFieldsChange}
              onSubmit={() => onSubmitSearch?.()}
              size="md"
            />
          </div>
        </div>
        {/* スワイプで探すショートカット — 全サイズで検索バーの右隣に出す。
            Tinder 風のカード重ねアイコン。 */}
        {onOpenSwipe && (
          <button
            type="button"
            onClick={onOpenSwipe}
            aria-label={t('home.swipeShortcutAria')}
            className="flex-shrink-0 w-10 h-10 rounded-full grid place-items-center transition-all hover:-translate-y-0.5 text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
            style={{
              background:
                'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* 重なった 2 枚のカード（Tinder 風スワイプを連想） */}
              <rect x="6.5" y="3.5" width="13" height="17" rx="2.5" transform="rotate(8 13 12)" />
              <rect x="3.5" y="3.5" width="13" height="17" rx="2.5" />
            </svg>
          </button>
        )}
        {/* Right side */}
        <div className="hidden md:flex items-center gap-5 flex-shrink-0">
          {/* PC では左サイドバーに「マップ」タブがあるため、二重化を避けて lg 以上では非表示 */}
          <button
            onClick={onOpenMap}
            className="lg:hidden text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t('home.navMap')}
          </button>
          {/* 匿名のみ Sign up / Log in を出す。
              ログイン済ユーザーの @nickname 表示は左サイドバー（PC）と
              アカウント画面に集約したので topbar 右上からは削除。 */}
          {isAnonymous && (
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

/* お店ランキング用カード（保存数の多いお店）— Claude Design 風 */
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
  const { t, language } = useTranslation();
  // メダル背景：1=金、2=シルバー、3=オレンジ、4位以降=ダークグレー
  const medalBg =
    rank === 1 ? 'var(--stg-yellow)' :
    rank === 2 ? 'var(--stg-gray-400)' :
    rank === 3 ? 'var(--stg-orange-500)' :
    'var(--stg-gray-700)';
  const medalColor = rank === 1 ? '#5a3e00' : 'white';
  const photo = (spot.photoUrls && spot.photoUrls[0]) || fallbackPhoto(spot.restaurantId, { name: spot.name, genre: spot.genres?.[0] });
  return (
    <button
      onClick={onClick}
      /* `flex flex-col` を明示しないと、grid cell に伸ばされた button の中で
         コンテンツがブラウザ既定のボタンセンタリングで縦方向中央寄せになり、
         「行った」chip がある card だけ body が高い → 他の card は photo が
         下にズレて見える、という事故が起きる。flex 列にして photo を必ず
         先頭に固定する。 */
      className="group text-left overflow-hidden cursor-pointer transition-all hover:-translate-y-1 flex flex-col"
      style={{
        /* dark mode でも自然に切り替わるよう card-bg に。 */
        background: 'var(--card-bg)',
        borderRadius: 18,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px var(--border)',
      }}
    >
      <div className="relative overflow-hidden flex-shrink-0" style={{ aspectRatio: '4 / 3', background: 'var(--bg-soft)' }}>
        <img
          loading="lazy"
          src={photo}
          alt={spot.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(spot.restaurantId, { name: spot.name, genre: spot.genres?.[0] });
          }}
        />
        {/* メダル + 順位ピル */}
        <div
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-extrabold"
          style={{
            /* 写真上の overlay なので白背景で固定（dark text を 読ませる） */
            background: 'white',
            color: 'var(--stg-ink)',
            borderRadius: 999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <span
            className="grid place-items-center w-[18px] h-[18px] rounded-full text-[10px] font-bold"
            style={{ background: medalBg, color: medalColor }}
          >
            {rank}
          </span>
          {t('home.rankSuffix')}
        </div>
        {/* saved count バッジ */}
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', borderRadius: 999 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--stg-orange-300)' }}><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>
          {spot.stockCount}
        </div>
        {/* bookmark トグル（既存挙動を維持） */}
        <span
          onClick={(e) => { e.stopPropagation(); onBookmark(); }}
          role="button"
          aria-label="bookmark"
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full grid place-items-center shadow-[var(--shadow-sm)] transition-transform hover:scale-110 cursor-pointer"
          style={bookmarked ? { background: 'var(--accent-orange)' } : { background: 'rgba(255,255,255,0.92)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={bookmarked ? 'white' : 'none'} stroke={bookmarked ? 'white' : '#1a1a1a'} strokeWidth="2">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </span>
      </div>
      <div className="px-4 pt-3.5 pb-4 flex-1 flex flex-col">
        <div
          className="font-bold tracking-[-0.01em] truncate"
          style={{ fontSize: 15, color: 'var(--text-primary)' }}
          title={spot.name}
        >
          {spot.name}
        </div>
        <div
          className="flex items-center gap-2 mt-1 flex-wrap"
          style={{ fontSize: 12, color: 'var(--text-secondary)' }}
        >
          {spot.genres?.[0] && <span>{localizeGenreFn(spot.genres[0], language)}</span>}
          {spot.genres?.[0] && spot.priceRange && <span className="opacity-50">·</span>}
          {spot.priceRange && <span>{spot.priceRange}</span>}
        </div>
        {/* ジャンルチップ（クリームベース） */}
        {spot.genres && spot.genres.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {spot.genres.slice(1, 4).map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: 'var(--stg-cream-100)',
                  color: 'var(--stg-orange-700)',
                  borderRadius: 999,
                }}
              >
                {localizeGenreFn(g, language)}
              </span>
            ))}
          </div>
        )}
        {/* 行った chip — visited で無くても DOM に常駐させて高さを予約する。
            これで「行った」付き card と無し card の body 高さが揃い、
            写真が縦にズレない。 */}
        <span
          aria-hidden={!visited}
          className="inline-flex items-center gap-1 mt-2 self-start text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: 'var(--visited-green)',
            background: 'rgba(140,199,64,0.12)',
            visibility: visited ? 'visible' : 'hidden',
          }}
        >
          <CheckIcon size={11} /> {visitedLabel}
        </span>
      </div>
    </button>
  );
}

/* RankedSpot を FeedRestaurant に変換してプレビューモーダルに渡す。
   lat/lng は backend が返してるので拾う（無ければ 0 で「マップで見る」disabled）。 */
function spotToFeedRestaurant(s: api.RankedSpot): FeedRestaurant {
  return {
    id: s.restaurantId,
    name: s.name,
    address: s.address ?? '',
    lat: typeof s.lat === 'number' ? s.lat : 0,
    lng: typeof s.lng === 'number' ? s.lng : 0,
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

/** 投稿者カード — Claude Design 風 creator-card（avatar 行 + stats + フォロー風 CTA） */
function RankCard({
  rank,
  user,
  onClick,
}: {
  rank: number;
  user: api.RankedUser;
  onClick: () => void;
}) {
  const { t, language } = useTranslation();
  const displayName = localizeProperNoun(user.nickname, language);
  const photo = user.profilePhotoUrl;
  // 順位ごとに avatar アクセント色を変える（1=金、2=シルバー、3=オレンジ、それ以降=パープル/ブルー）
  const accentBg =
    rank === 1 ? 'var(--stg-yellow)' :
    rank === 2 ? 'var(--stg-gray-400)' :
    rank === 3 ? 'var(--stg-orange-500)' :
    'var(--stg-purple)';
  return (
    <button
      onClick={onClick}
      className="text-left flex flex-col gap-3 transition-all hover:-translate-y-0.5 cursor-pointer"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full overflow-hidden grid place-items-center font-extrabold text-white flex-shrink-0"
          style={{ background: accentBg }}
        >
          {photo ? (
            <img loading="lazy" src={photo} alt={displayName} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <span style={{ fontSize: 16 }}>{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
            {displayName}
          </div>
          <div className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            @{displayName}
          </div>
        </div>
        <span
          className="inline-flex items-center justify-center text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'var(--bg-soft)', color: 'var(--text-primary)' }}
        >
          {rank}{t('home.rankSuffix')}
        </span>
      </div>
      <div className="flex gap-3.5" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <div>
          <b style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>{user.totalStocks}</b> {t('home.rankSavesSuffix')}
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
  big = false,
  tagVariant = 'orange',
}: {
  image: string;
  tag: string;
  title: string;
  desc: string;
  onClick?: () => void;
  /** lg+ で 1 つ目を縦長スパンするかどうか（雑誌レイアウト用） */
  big?: boolean;
  /** タグピルの色バリアント */
  tagVariant?: 'orange' | 'purple' | 'dark';
}) {
  const tagBg =
    tagVariant === 'purple' ? 'var(--stg-purple)' :
    tagVariant === 'dark' ? 'rgba(0,0,0,0.6)' :
    'var(--stg-orange-500)';
  const tagBlur = tagVariant === 'dark' ? 'blur(10px)' : undefined;
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden cursor-pointer block w-full text-left transition-transform duration-300 hover:-translate-y-1 ${big ? 'lg:row-span-2' : ''}`}
      style={{
        borderRadius: 18,
        background: 'var(--stg-gray-100)',
      }}
    >
      <img loading="lazy" src={image} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-[1.05]" />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)' }}
      />
      <div className="absolute inset-0 p-5 sm:p-[22px] flex flex-col justify-end text-white">
        <span
          className="self-start text-[11px] font-bold px-2.5 py-[5px] rounded-full mb-auto uppercase tracking-[0.06em]"
          style={{ background: tagBg, backdropFilter: tagBlur }}
        >
          {tag}
        </span>
        <div>
          <div
            className={`font-extrabold leading-[1.25] tracking-[-0.02em] whitespace-pre-line ${big ? 'text-[28px]' : 'text-[20px] sm:text-[22px]'}`}
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)', marginBottom: 8 }}
          >
            {title}
          </div>
          <div
            className="leading-[1.55] opacity-90"
            style={{ fontSize: 13, textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}
          >
            {desc}
          </div>
        </div>
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
  const { t, language } = useTranslation();
  const photo =
    (restaurant.photoUrls && restaurant.photoUrls[0]) || fallbackPhoto(restaurant.id, { name: restaurant.name, genre: restaurant.genre });
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
            (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id, { name: restaurant.name, genre: restaurant.genre });
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
          aria-label={bookmarked ? t('home.bookmarkRemoveAria') : t('home.bookmarkAria')}
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
          title={localizeProperNoun(restaurant.name, language)}
        >
          {localizeProperNoun(restaurant.name, language)}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] mb-2 flex-wrap">
          {distance && <span className="font-medium">{distance}</span>}
          {distance && restaurant.genre && <span className="opacity-40">·</span>}
          {restaurant.genre && <span>{localizeGenreFn(restaurant.genre, language)}</span>}
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
                {localizeSceneFn(s, language)}
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

function FooterCol({
  heading,
  items,
}: {
  heading: string;
  /** href を指定すると navigate、onClick を指定するとそれを優先呼び出し
      （legal 系は SPA 内で sheet を開きたいので onClick を使う） */
  items: { label: string; href?: string; onClick?: () => void }[];
}) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-3">
        {heading}
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              onClick={() => { if (item.onClick) item.onClick(); else if (item.href) navigate(item.href); }}
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
        className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] max-w-[600px] w-full max-h-[90svh] overflow-auto shadow-[var(--shadow-xl)]"
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
   App download banner — Claude Design 風（ダーク + オレンジアクセント + バッジ）
   ───────────────────────────────────── */
function AppDownloadBanner() {
  const { t } = useTranslation();
  // 実際の App Store / Google Play 配信が始まったらここに URL を入れる。
  // 未公開の間は null にして PlayStore と同じく「準備中」として disabled
  // 表示する（誤って '#' に飛ぶと UX 上ノイズになるため）。
  // 例: 'https://apps.apple.com/jp/app/stoguru/id0000000000'
  //     'https://play.google.com/store/apps/details?id=app.stoguru'
  const APP_STORE_URL: string | null = (import.meta.env.VITE_APP_STORE_URL as string | undefined) ?? null;
  const PLAY_STORE_URL: string | null = (import.meta.env.VITE_PLAY_STORE_URL as string | undefined) ?? null;

  return (
    <section
      className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 mt-10"
      style={{ background: 'var(--stg-gray-900)', color: 'white' }}
    >
      {/* グロー */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(50% 50% at 80% 20%, rgba(254,141,40,0.18), transparent 60%), radial-gradient(40% 40% at 10% 80%, rgba(254,204,0,0.12), transparent 60%)',
        }}
      />
      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-center">
        <div>
          <h2 className="font-extrabold leading-[1.1] tracking-[-0.03em] mb-3.5" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
            {t('home.appBannerTitle')}
            <br />
            <span style={{ color: 'var(--stg-orange-400)' }}>{t('home.appBannerCTA')}</span>
          </h2>
          <p className="leading-[1.6] mb-6 max-w-[460px]" style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)' }}>
            {t('home.appBannerSubtitle')}
          </p>
          <div className="flex gap-3 flex-wrap">
            <AppStoreBadge href={APP_STORE_URL} t={t} />
            <PlayStoreBadge href={PLAY_STORE_URL} t={t} />
          </div>
        </div>
        {/* 右側：LogoMark を装飾的に大きく表示。
            白い枠カードは外して LogoMark + テキストだけ直置き。 */}
        <div className="hidden lg:flex flex-col items-center justify-center">
          <LogoMark size={168} radius={36} />
          <p className="text-[11px] mt-3 text-center" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {t('home.appBadgeComingSoon')}
          </p>
        </div>
      </div>
    </section>
  );
}

function AppStoreBadge({ href, t }: { href: string | null; t: (k: string) => string }) {
  // href が null の間は「準備中」として disabled 表示（PlayStoreBadge と
  // 同パターン）。実際にストアに公開されたら VITE_APP_STORE_URL を設定。
  const disabled = !href;
  const Wrapper = disabled ? 'div' : 'a';
  const wrapperProps = disabled
    ? { 'aria-disabled': true as const, title: t('home.appBadgeComingSoon') }
    : { href: href as string, target: '_blank', rel: 'noopener noreferrer' as const, 'aria-label': 'Download on the App Store' };
  return (
    <Wrapper
      {...(wrapperProps as Record<string, unknown>)}
      className={`flex items-center gap-2.5 bg-black text-white px-3.5 py-2 rounded-[10px] transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-900'
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.523 12.78c-.04-3.276 2.673-4.866 2.794-4.94-1.523-2.226-3.892-2.531-4.738-2.567-2.014-.205-3.93 1.18-4.95 1.18-1.022 0-2.6-1.151-4.275-1.119-2.198.033-4.226 1.276-5.358 3.246-2.286 3.965-.585 9.83 1.638 13.045 1.087 1.575 2.382 3.345 4.075 3.281 1.638-.066 2.255-1.061 4.235-1.061 1.97 0 2.541 1.061 4.275 1.025 1.768-.029 2.886-1.6 3.964-3.18 1.247-1.823 1.762-3.587 1.79-3.677-.039-.018-3.42-1.31-3.45-5.233zM14.286 3.04c.905-1.097 1.515-2.621 1.348-4.139-1.305.053-2.886.868-3.823 1.965-.84.97-1.575 2.519-1.378 4.012 1.456.112 2.948-.74 3.853-1.838z"/>
      </svg>
      <div className="flex flex-col leading-tight items-start">
        <span className="text-[9px] font-medium opacity-90">{t('home.appBadgeAppStoreLine1')}</span>
        <span className="text-[14px] font-semibold tracking-tight">{t('home.appBadgeAppStoreLine2')}</span>
      </div>
    </Wrapper>
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
/**
 * 店舗プレビューモーダル。
 * Home（保存ランキング / おすすめ）と Stock 画面の両方から開くため export 化。
 * `onShowOnMap` を渡すと「マップで見る」ボタンが追加で表示され、
 * 押下でモーダルを閉じてから渡されたコールバックを呼ぶ（保存画面用）。
 */
export function RestaurantPreviewModal({
  restaurant,
  userPosition,
  bookmarked,
  onBookmark,
  onClose,
  onShowOnMap,
}: {
  restaurant: FeedRestaurant;
  userPosition: GPSPosition | null;
  bookmarked: boolean;
  onBookmark: () => void;
  onClose: () => void;
  onShowOnMap?: () => void;
}) {
  const { t, language } = useTranslation();
  const distance = userPosition
    ? formatDistance(
        distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng),
      )
    : restaurant.distance || '';
  // photoUrls が複数あれば全部使う。空なら genre-aware fallback 1 枚で carousel 実質無効。
  const photos = (restaurant.photoUrls && restaurant.photoUrls.length > 0)
    ? restaurant.photoUrls
    : [fallbackPhoto(restaurant.id, { name: restaurant.name, genre: restaurant.genre })];
  const [photoIdx, setPhotoIdx] = useState(0);
  const hasMultiplePhotos = photos.length > 1;
  const goPrev = () => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  const goNext = () => setPhotoIdx((i) => (i + 1) % photos.length);
  const area = extractArea(restaurant.address ?? '');
  const genre = restaurant.genre || (restaurant.scene && restaurant.scene[0]) || '';
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] md:max-w-[520px] my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-[20px] overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
          style={{ background: 'var(--card-bg)' }}
        >
          {/* ── 写真エリア（× を右上 / 保存する を右下 / 複数枚なら左右タップで切替）── */}
          <div className="relative" style={{ aspectRatio: '4 / 3', background: 'var(--bg-soft)' }}>
            {/* 全 photo を absolute で重ねて opacity で切替。`key` 変えで img を
                再マウントすると一瞬白くなる（loading 中の placeholder 表示）ので、
                ロードはまとめて行い表示だけ切り替える。 */}
            {photos.map((p, i) => (
              <img
                key={p + ':' + i}
                loading={i === 0 ? 'eager' : 'lazy'}
                src={p}
                alt={i === photoIdx ? restaurant.name : ''}
                aria-hidden={i !== photoIdx}
                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-200"
                style={{ opacity: i === photoIdx ? 1 : 0 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id, { name: restaurant.name, genre: restaurant.genre }); }}
              />
            ))}
            {/* 左右タップゾーン（複数枚あるときだけ） */}
            {hasMultiplePhotos && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  aria-label={t('home.previewPrevPhoto')}
                  className="absolute left-0 top-12 bottom-16 w-1/3 flex items-center justify-start pl-2 group"
                  style={{ background: 'transparent' }}
                >
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-black/45 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  aria-label={t('home.previewNextPhoto')}
                  className="absolute right-0 top-12 bottom-16 w-1/3 flex items-center justify-end pr-2 group"
                  style={{ background: 'transparent' }}
                >
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-black/45 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </span>
                </button>
                {/* dot indicators（写真上端近く） */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 h-6 rounded-full bg-black/45 backdrop-blur-md">
                  {photos.map((_, i) => (
                    <span
                      key={i}
                      className="block rounded-full transition-all"
                      style={{
                        width: i === photoIdx ? 14 : 6,
                        height: 4,
                        background: i === photoIdx ? 'white' : 'rgba(255,255,255,0.5)',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {/* 上部のうっすらグラデで × ボタンを浮かせる */}
            <div className="absolute inset-x-0 top-0 h-20 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
            {/* × は design 通り右上 */}
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="absolute top-3 right-3 flex items-center justify-center w-9 h-9 rounded-full bg-black/55 backdrop-blur-md text-white hover:bg-black/70 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            {/* 保存する／保存済み — 写真の右下 */}
            <button
              onClick={(e) => { e.stopPropagation(); onBookmark(); }}
              aria-label={bookmarked ? t('home.bookmarkRemoveAria') : t('home.bookmarkAria')}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 px-4 h-10 rounded-full font-bold text-[13px] text-white shadow-[0_8px_20px_rgba(254,141,40,0.45)] transition-transform hover:-translate-y-0.5"
              style={{ background: bookmarked ? 'var(--stg-gray-700)' : 'var(--accent-orange)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              {bookmarked ? t('home.previewBookmarked') : t('home.previewBookmark')}
            </button>
          </div>

          {/* ── 情報エリア ── */}
          <div className="px-5 sm:px-6 pt-5 pb-6">
            <h2 className="font-extrabold tracking-[-0.01em]" style={{ fontSize: 22, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {localizeProperNoun(restaurant.name, language)}
            </h2>
            {/* 細い字の行は住所のみ。ジャンルと価格帯は下の 2x2 グリッドに
                同じ情報があるので重複を削る。コメント（description）は次の段で出す。 */}
            {restaurant.address && (
              <div
                className="flex items-center gap-2 mt-2"
                style={{ fontSize: 13, color: 'var(--text-secondary)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="truncate">{localizeProperNoun(restaurant.address, language)}</span>
              </div>
            )}

            {restaurant.description && (
              <p
                className="leading-[1.6] mt-3"
                style={{ fontSize: 14, color: 'var(--text-secondary)' }}
              >
                {restaurant.description}
              </p>
            )}

            {/* 2×2 grid：距離 / ジャンル / 価格帯 / エリア */}
            <div
              className="grid grid-cols-2 gap-3 mt-5 p-4 rounded-[14px]"
              style={{ background: 'var(--bg-soft)' }}
            >
              {[
                { label: t('home.previewLabelDistance'), value: distance || '—' },
                { label: t('home.previewLabelGenre'), value: genre ? localizeGenreFn(genre, language) : '—' },
                { label: t('home.previewLabelPrice'), value: restaurant.priceRange || '—' },
                { label: t('home.previewLabelArea'), value: area || '—' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-tertiary)' }}>
                    {row.label}
                  </div>
                  <div className="font-bold mt-0.5 truncate" style={{ fontSize: 15, color: 'var(--text-primary)' }} title={row.value}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            {/* シーン chips */}
            {restaurant.scene && restaurant.scene.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {restaurant.scene.slice(0, 5).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center font-semibold"
                    style={{
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 999,
                      background: 'var(--stg-cream-200)',
                      color: 'var(--stg-orange-700)',
                    }}
                  >
                    {localizeSceneFn(s, language)}
                  </span>
                ))}
              </div>
            )}

            {/* ボトムアクション：マップで見る / 公式サイトを開く（design 準拠） */}
            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onShowOnMap) {
                    onClose();
                    onShowOnMap();
                  }
                }}
                disabled={!onShowOnMap}
                className="inline-flex items-center justify-center gap-1.5 h-11 rounded-full font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  fontSize: 13,
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                {t('home.previewActionMap')}
              </button>
              {(() => {
                // 「動画を見る」: TikTok / Instagram / YouTube などの videoUrl を
                // 新タブで開く。存在しない時は disabled 風（クリックは無効）にして
                // ボタン自体は出しっぱなしで「マップで見る」と並びを揃える。
                const videoUrl = restaurant.videoUrl ?? '';
                return (
                  <a
                    href={videoUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!videoUrl) e.preventDefault();
                    }}
                    aria-disabled={!videoUrl}
                    className="inline-flex items-center justify-center gap-1.5 h-11 rounded-full font-semibold text-white shadow-[0_8px_20px_rgba(254,141,40,0.35)] hover:-translate-y-0.5 transition-transform"
                    style={{
                      fontSize: 13,
                      background: 'var(--accent-orange)',
                      textDecoration: 'none',
                      opacity: videoUrl ? 1 : 0.4,
                      pointerEvents: videoUrl ? 'auto' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    {t('home.previewActionVideo')}
                  </a>
                );
              })()}
            </div>
          </div>
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
   ジャンル全件モーダル（食べログ / Retty 風）
   ───────────────────────────────────── */
/* 「ジャンルから探す」セクションの右上 → から開く全件モーダル。
   人気 8 個は写真タイル、残り（25 個前後）はチップで一覧。
   タップで /themes/{name} に遷移（findTheme は未登録ジャンルでも auto fallback）。 */
function GenreListModal({
  onClose,
  onSelectGenre,
}: {
  onClose: () => void;
  onSelectGenre: (genre: string) => void;
}) {
  const { t, language } = useTranslation();
  const restGenres = GENRES.filter((g) => !(POPULAR_GENRES as readonly string[]).includes(g));
  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg)] overflow-auto animate-fade-in" onClick={onClose}>
      <div
        // 下端の bottom-tab (ホーム/マップ/保存/アカウント, 高さ ~80px + safe-area)
        // にチップが隠れないよう、十分な padding-bottom と env(safe-area) を確保。
        className="max-w-[860px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10"
        style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[22px] sm:text-[26px] font-extrabold tracking-[-0.02em]">
              {t('home.genreModalTitle')}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
              {t('home.genreModalSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-10 h-10 grid place-items-center rounded-full bg-[var(--card-bg)] border border-[var(--border)] hover:bg-[var(--bg-soft)] shadow-[var(--shadow-sm)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 人気 8（写真タイル） */}
        <div className="mb-7">
          <div className="text-[11px] uppercase tracking-[0.04em] font-bold text-[var(--text-tertiary)] mb-3">
            {t('home.genreSectionPopular')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {POPULAR_GENRES.map((g) => (
              <button
                key={g}
                onClick={() => onSelectGenre(g)}
                className="relative aspect-[16/10] rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5"
                style={{ background: 'var(--bg-soft)' }}
              >
                <img
                  loading="lazy"
                  src={ALL_GENRE_PHOTOS[g] ?? ''}
                  alt={g}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))' }}
                />
                <div className="absolute bottom-2 left-3 right-3 text-white">
                  <div className="font-extrabold text-[15px] drop-shadow">{localizeGenreFn(g, language)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 全件フラット（チップ 2 列） */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.04em] font-bold text-[var(--text-tertiary)] mb-3">
            {t('home.genreSectionAll')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {restGenres.map((g) => (
              <button
                key={g}
                onClick={() => onSelectGenre(g)}
                className="px-4 py-3 rounded-xl text-[13px] font-medium text-left transition-colors hover:bg-[var(--stg-cream-100)]"
                style={{
                  background: 'var(--stg-cream-50)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {localizeGenreFn(g, language)}
              </button>
            ))}
          </div>
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
  const { t } = useTranslation();
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
          <img loading="lazy" src={theme.image} alt="" className="w-full h-full object-cover" />
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
            <h2 className="text-[18px] sm:text-[20px] font-extrabold tracking-[-0.015em]">{t('home.themeMatchTitle')}</h2>
            <span className="text-[13px] text-[var(--text-tertiary)]">{matched.length} {t('home.themeMatchCountSuffix')}</span>
          </div>
          {matched.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] text-sm bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
              {t('home.themeNoMatch')}
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
