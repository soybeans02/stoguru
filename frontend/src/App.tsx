import { useState, useCallback, useEffect, useMemo, Suspense } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
import './sidebar.css';
import { useAuth } from './context/AuthContext';
import { useTranslation } from './context/LanguageContext';
import { useGPS } from './hooks/useGPS';
import { OnboardingScreen } from './components/onboarding/OnboardingScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthModal } from './components/auth/AuthModal';
import { SignUpGate } from './components/auth/SignUpGate';
import { SwipeScreen } from './components/swipe/SwipeScreen';
import { DiscoveryHome } from './components/home/DiscoveryHome';
import { StockScreen } from './components/stock/StockScreen';
import type { StockedRestaurant } from './components/stock/StockScreen';
import { AccountScreen } from './components/account/AccountScreen';
import { SocialScreen } from './components/social/SocialScreen';
import { PublicProfileScreen } from './components/user/PublicProfileScreen';
import { FeatureArticleScreen } from './components/feature/FeatureArticleScreen';
import { StaticPageScreen } from './components/feature/StaticPageScreen';
import { ThemeListScreen } from './components/theme/ThemeListScreen';

const LazyMapView = lazyWithRetry(() =>
  import.meta.env.VITE_MAP_PROVIDER === 'mapbox'
    ? import('./components/map/SimpleMapViewMapbox').then(m => ({ default: m.SimpleMapViewMapbox }))
    : import('./components/map/SimpleMapView').then(m => ({ default: m.SimpleMapView }))
);
import type { SwipeRestaurant } from './data/mockRestaurants';
import { MOCK_RESTAURANTS } from './data/mockRestaurants';
import * as api from './utils/api';
type Tab = 'home' | 'swipe' | 'stock' | 'map' | 'social' | 'account';

/* ─── SVG Icons — Claude Design (account-app.jsx の Ic と完全一致の path) ─── */
function IconHome({ size = 18 }: { active?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z"/>
    </svg>
  );
}
function IconMap({ size = 18 }: { active?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>
    </svg>
  );
}
function IconBookmark({ size = 18 }: { active?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/>
    </svg>
  );
}
function IconUser({ size = 18 }: { active?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
    </svg>
  );
}
/* Brand mark — Claude Design の <a className="brand"> 内 SVG と同一 */
function BrandMark() {
  // ピン本体は currentColor（sidebar.css で white に塗ってる）。中央のドットを
  // オレンジ（#FE8D28）にすることで「白いピンに位置情報マーカーが乗っている」
  // ような見た目にする。LogoMark / favicon も同じ色構成。
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7Z"/>
      <circle cx="12" cy="9" r="3" fill="#FE8D28"/>
    </svg>
  );
}

/* ─── Sidebar (PC) — Claude Design 準拠 (.stg-sidebar / .side-link / .sidebar__user) ─── */
function Sidebar({
  tab,
  onTabChange,
  onLogoClick,
  user,
  stockCount,
  profileImage,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onLogoClick?: () => void;
  user: { userId: string; email: string; nickname: string } | null;
  stockCount: number;
  profileImage?: string;
}) {
  const { t } = useTranslation();
  const items: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'home', label: t('tabs.home'), icon: <IconHome /> },
    { key: 'map', label: t('tabs.map'), icon: <IconMap /> },
    { key: 'stock', label: t('tabs.stock'), icon: <IconBookmark />, count: stockCount },
    { key: 'account', label: t('tabs.account'), icon: <IconUser /> },
  ];

  // ユーザーのアバター文字（ニックネーム先頭 1 文字を大文字化）
  const avatarChar = (user?.nickname ?? 'g').charAt(0).toUpperCase();
  const handle = user ? user.nickname : 'guest';

  return (
    <aside className="stg-sidebar">
      {/* Brand — design の .brand 構造そのまま */}
      <button
        onClick={() => { onTabChange('home'); onLogoClick?.(); }}
        className="stg-brand"
        aria-label={t('common.refreshHomeAria')}
      >
        <span className="stg-brand__mark">
          <BrandMark />
        </span>
        <span className="stg-brand__name">
          stoguru<span className="stg-brand__sub">ストグル</span>
        </span>
      </button>

      {/* Nav links */}
      <nav className="stg-sidebar__nav">
        {items.map(({ key, label, icon, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`side-link ${active ? 'is-active' : ''}`}
            >
              {icon}
              {label}
              {typeof count === 'number' && count > 0 && (
                <span className="side-link__count">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 左下：現在ログイン中のユーザー（design の .sidebar__user） */}
      <div className="sidebar__user">
        <div className="sidebar__user-avatar">
          {profileImage ? <img src={profileImage} alt="" /> : avatarChar}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sidebar__user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.nickname ?? t('common.guest')}
          </div>
          <div className="sidebar__user-handle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{handle}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ─── Bottom Tab (Mobile) ─── */
function BottomTab({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  const { t } = useTranslation();
  // 「検索」タブは消し、ホームのヒーロー検索に集約
  const items: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'home', label: t('tabs.home'), icon: <IconHome size={22} /> },
    { key: 'map', label: t('tabs.map'), icon: <IconMap size={22} /> },
    { key: 'stock', label: t('tabs.stock'), icon: <IconBookmark size={22} /> },
    { key: 'account', label: t('tabs.account'), icon: <IconUser size={22} /> },
  ];

  return (
    <nav className="lg:hidden flex items-center justify-around bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 h-14 pb-safe flex-shrink-0">
      {items.map(({ key, label, icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 transition-colors ${active ? 'text-orange-500' : 'text-gray-300 dark:text-gray-500'}`}
          >
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MainApp() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAnonymous = !user;
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = sessionStorage.getItem('activeTab') as Tab | null;
    return saved && ['home', 'swipe', 'stock', 'map', 'social', 'account'].includes(saved) ? saved : 'home';
  });
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const setTab = (t: Tab) => {
    if (t === 'home' && tab !== 'home') setFeedRefreshKey(k => k + 1);
    setTabState(t);
    sessionStorage.setItem('activeTab', t);
  };
  const [stocks, setStocks] = useState<StockedRestaurant[]>([]);
  const [panTo, setPanTo] = useState<{ lat: number; lng: number; restaurant?: StockedRestaurant } | null>(null);
  const { position } = useGPS();
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);

  // 別ルート（ThemeListScreen / FeatureArticleScreen 等）から navigate('/')
  // で戻ってきた時に「マップで見る」を引き継ぐためのブリッジ。
  // 該当ルート側で sessionStorage('pendingPanTo') に { lat, lng } を入れて
  // navigate('/') すると、ここで読んで panTo + tab=map に反映する。
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pendingPanTo');
      if (!raw) return;
      sessionStorage.removeItem('pendingPanTo');
      const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
      if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
        setPanTo({ lat: parsed.lat, lng: parsed.lng });
        setTab('map');
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 起動時にバックエンドからストック復元（ログイン済みのみ）
  useEffect(() => {
    if (!user) { setStocks([]); return; }
    const mockMap = new Map(MOCK_RESTAURANTS.map((m) => [m.id, m]));
    api.fetchRestaurants().then((data: Record<string, unknown>[]) => {
      const restored: StockedRestaurant[] = data.map((r) => {
        const id = String(r.restaurantId ?? r.id);
        const mock = mockMap.get(id);
        // photoUrls はバックエンド GET /restaurants が返す string[]。
        // 以前は mapping から漏れていたため StockScreen で写真が出なかった。
        const rawPhotos = Array.isArray(r.photoUrls) ? (r.photoUrls as unknown[]) : [];
        const photoUrls = rawPhotos
          .map((p) => (typeof p === 'string' ? p : ''))
          .filter((p) => !!p);
        return {
          id,
          name: String(r.name ?? mock?.name ?? ''),
          address: String(r.address ?? mock?.address ?? ''),
          lat: Number(r.lat ?? mock?.lat ?? 0),
          lng: Number(r.lng ?? mock?.lng ?? 0),
          genre: String(r.genre || mock?.genre || ''),
          scene: Array.isArray(r.scene) ? r.scene as string[] : (mock?.scene ?? []),
          priceRange: String(r.priceRange || mock?.priceRange || ''),
          distance: String(r.distance || mock?.distance || ''),
          influencer: (r.influencer as SwipeRestaurant['influencer']) ?? mock?.influencer ?? { name: '', handle: '', platform: 'tiktok' as const },
          videoUrl: String(r.videoUrl || mock?.videoUrl || ''),
          photoEmoji: String(r.photoEmoji || mock?.photoEmoji || '🍽️'),
          photoUrls: photoUrls.length > 0 ? photoUrls : (mock?.photoUrls ?? []),
          visited: r.status === 'visited',
          pinned: !!r.pinned,
          stockedAt: String(r.createdAt ?? new Date().toISOString()),
          visitedAt: r.visitedAt ? String(r.visitedAt) : undefined,
        };
      });
      setStocks(restored);
    }).catch(() => {});
  }, [user]);

  const handleStock = useCallback((r: SwipeRestaurant) => {
    // 匿名なら登録を促すモーダルを表示するのみ（サーバー送信しない）
    if (!user) {
      setAuthModal('signup');
      return;
    }
    setStocks((prev) => {
      if (prev.some((s) => s.id === r.id)) return prev;
      return [...prev, { ...r, visited: false, stockedAt: new Date().toISOString() }];
    });
    api.putRestaurant({
      id: r.id, name: r.name, address: r.address, lat: r.lat, lng: r.lng,
      genre: r.genre, scene: r.scene, priceRange: r.priceRange, distance: r.distance,
      influencer: r.influencer, videoUrl: r.videoUrl, photoEmoji: r.photoEmoji, status: 'wishlist',
    }).catch((e) => console.warn('Failed to stock:', e));
  }, [user]);

  const handleMarkVisited = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStocks((prev) => {
      const stock = prev.find((s) => s.id === id);
      if (stock) {
        api.putRestaurant({
          id, name: stock.name, address: stock.address, lat: stock.lat, lng: stock.lng,
          genre: stock.genre, scene: stock.scene, priceRange: stock.priceRange, distance: stock.distance,
          influencer: stock.influencer, videoUrl: stock.videoUrl, photoEmoji: stock.photoEmoji,
          pinned: stock.pinned, status: 'visited', visitedAt: now,
        }).catch((e) => console.warn('Failed to mark visited:', e));
      }
      return prev.map((s) => s.id === id ? { ...s, visited: true, visitedAt: now } : s);
    });
  }, []);

  const handleUnmarkVisited = useCallback((id: string) => {
    setStocks((prev) => {
      const stock = prev.find((s) => s.id === id);
      if (stock) {
        api.putRestaurant({
          id, name: stock.name, address: stock.address, lat: stock.lat, lng: stock.lng,
          genre: stock.genre, scene: stock.scene, priceRange: stock.priceRange, distance: stock.distance,
          influencer: stock.influencer, videoUrl: stock.videoUrl, photoEmoji: stock.photoEmoji,
          pinned: stock.pinned, status: 'wishlist', visitedAt: undefined,
        }).catch((e) => console.warn('Failed to unmark visited:', e));
      }
      return prev.map((s) => s.id === id ? { ...s, visited: false, visitedAt: undefined } : s);
    });
  }, []);

  const handleRemoveStock = useCallback((id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
    api.deleteRestaurant(id).catch((e) => console.warn('Failed to delete:', e));
  }, []);

  const handleTogglePin = useCallback((id: string) => {
    setStocks((prev) => {
      const stock = prev.find((s) => s.id === id);
      if (stock) {
        api.putRestaurant({
          id, name: stock.name, address: stock.address, lat: stock.lat, lng: stock.lng,
          genre: stock.genre, status: stock.visited ? 'visited' : 'wishlist', pinned: !stock.pinned,
        }).catch((e) => console.warn('Failed to toggle pin:', e));
      }
      return prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s);
    });
  }, []);

  const stockedIds = useMemo(() => stocks.map(s => s.id), [stocks]);
  const visitedIds = useMemo(() => stocks.filter(s => s.visited).map(s => s.id), [stocks]);
  const refreshFeed = useCallback(() => setFeedRefreshKey(k => k + 1), []);
  const [socialInitView, setSocialInitView] = useState<string | null>(null);
  const [socialInitQuery, setSocialInitQuery] = useState<string | null>(null);
  const [socialInitGeo, setSocialInitGeo] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);

  const handleShowOnMap = useCallback((lat: number, lng: number, restaurant?: StockedRestaurant) => {
    setPanTo({ lat, lng, restaurant });
    setTab('map');
  }, []);

  // 左下ユーザー表示で使うプロフィール画像。
  // user が居ない（ゲスト）ときは前回ユーザーの localStorage キャッシュが
  // 残っていても見せない。ログアウト時に key を消し損ねたケースの保険でもある。
  const profileImage = user
    ? (typeof localStorage !== 'undefined' ? localStorage.getItem('cache:profileImage') : null) ?? undefined
    : undefined;

  return (
    <div className="flex h-svh bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden">
      {/* PC: Left Sidebar */}
      <Sidebar
        tab={tab}
        onTabChange={setTab}
        onLogoClick={refreshFeed}
        user={user}
        stockCount={stocks.length}
        profileImage={profileImage}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          {tab === 'home' && (
            <DiscoveryHome
              onStock={handleStock}
              onRemoveStock={handleRemoveStock}
              onOpenMap={() => setTab('map')}
              onShowOnMap={(lat, lng) => handleShowOnMap(lat, lng)}
              onOpenSwipe={() => setTab('swipe')}
              onOpenAccount={() => setTab('account')}
              onOpenSaved={() => setTab('stock')}
              onSearch={(q, geo) => { setSocialInitQuery(q); setSocialInitGeo(geo ?? null); setTab('social'); }}
              onReload={refreshFeed}
              userPosition={position}
              stocks={stocks}
              stockedIds={stockedIds}
              visitedIds={visitedIds}
              refreshKey={feedRefreshKey}
            />
          )}
          {tab === 'swipe' && (
            <SwipeScreen
              onStock={handleStock}
              onRemoveStock={handleRemoveStock}
              onShowOnMap={handleShowOnMap}
              onOpenNotifications={() => { setSocialInitView('notifications'); setTab('social'); }}
              onBack={() => setTab('home')}
              userPosition={position}
              stockedIds={stockedIds}
              refreshKey={feedRefreshKey}
            />
          )}
          {tab === 'stock' && (
            isAnonymous ? (
              <SignUpGate
                title={t('auth.gateStockTitle')}
                description={t('auth.gateStockDescription')}
              />
            ) : (
              <StockScreen
                stocks={stocks}
                onMarkVisited={handleMarkVisited}
                onUnmarkVisited={handleUnmarkVisited}
                onRemoveStock={handleRemoveStock}
                onTogglePin={handleTogglePin}
                onShowOnMap={handleShowOnMap}
                userPosition={position}
              />
            )
          )}
          {tab === 'map' && (
            <ErrorBoundary scope="inline">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><p className="text-gray-400">{t('common.loadingMap')}</p></div>}>
                <LazyMapView
                  stocks={stocks}
                  panTo={panTo}
                  onPanComplete={() => setPanTo(null)}
                  userPosition={position}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {tab === 'social' && (
            <SocialScreen
              initialView={socialInitView}
              onInitViewConsumed={() => setSocialInitView(null)}
              initialQuery={socialInitQuery}
              onInitQueryConsumed={() => setSocialInitQuery(null)}
              initialGeo={socialInitGeo}
              onInitGeoConsumed={() => setSocialInitGeo(null)}
              onGoHome={() => setTab('home')}
            />
          )}
          {tab === 'account' && (
            isAnonymous ? (
              <SignUpGate
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
                  </svg>
                }
                title={t('auth.gateAccountTitle')}
                description={t('auth.gateAccountDescription')}
              />
            ) : (
              <AccountScreen stocks={stocks} onRestaurantEdited={refreshFeed} />
            )
          )}
        </main>

        {/* Mobile: Bottom Tab */}
        <BottomTab tab={tab} onTabChange={setTab} />
      </div>

      {/* 匿名ユーザーが auth 必要操作（保存スワイプ等）したときに開く */}
      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}

/* シンプル URL ルーター */
type Route =
  | { type: 'app' }
  | { type: 'profile'; userId: string }
  | { type: 'feature'; slug: string }
  | { type: 'theme'; id: string }
  | { type: 'static'; slug: string };

function parseRoute(): Route {
  const path = window.location.pathname;
  let m;
  if ((m = path.match(/^\/u\/([^/]+)$/))) return { type: 'profile', userId: decodeURIComponent(m[1]) };
  if ((m = path.match(/^\/features\/([^/]+)$/))) return { type: 'feature', slug: decodeURIComponent(m[1]) };
  if ((m = path.match(/^\/themes\/([^/]+)$/))) return { type: 'theme', id: decodeURIComponent(m[1]) };
  if ((m = path.match(/^\/p\/([^/]+)$/))) return { type: 'static', slug: decodeURIComponent(m[1]) };
  return { type: 'app' };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

/** PWA / iOS native 起動かどうかを判定。
 *  web ブラウザで開いている時はオンボーディングを丸ごとスキップする。
 *  - iOS Safari: navigator.standalone === true
 *  - Android / Chromium PWA: display-mode: standalone */
function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayMode;
}

export default function App() {
  const { loading } = useAuth();
  const route = useRoute();
  const { t } = useTranslation();
  // web ブラウザで開いた時はオンボーディング画面（取説）を出さない。
  // PWA インストール / iOS native（将来）の時だけ初回表示。
  const [onboardingDone, setOnboardingDone] = useState(() => {
    if (!isStandaloneApp()) return true;
    return localStorage.getItem('onboarding_done') === '1';
  });

  const handleOnboardingComplete = useCallback((selectedScenes: string[]) => {
    localStorage.setItem('onboarding_done', '1');
    if (selectedScenes.length > 0) {
      localStorage.setItem('onboarding_scenes', JSON.stringify(selectedScenes));
    }
    setOnboardingDone(true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400 dark:text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  // 公開ページ（匿名・オンボーディング前でも閲覧可能）
  if (route.type === 'profile') {
    return <ErrorBoundary><PublicProfileScreen userId={route.userId} /></ErrorBoundary>;
  }
  if (route.type === 'feature') {
    return <ErrorBoundary><FeatureArticleScreen slug={route.slug} /></ErrorBoundary>;
  }
  if (route.type === 'theme') {
    return <ErrorBoundary><ThemeListScreen themeId={route.id} /></ErrorBoundary>;
  }
  if (route.type === 'static') {
    return <ErrorBoundary><StaticPageScreen slug={route.slug} /></ErrorBoundary>;
  }

  // 匿名でもオンボーディング → メインアプリへ進める。AuthScreen 強制ガードは廃止。
  if (!onboardingDone) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return <ErrorBoundary><MainApp /></ErrorBoundary>;
}
