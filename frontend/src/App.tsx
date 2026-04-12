import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import { useGPS } from './hooks/useGPS';
import { OnboardingScreen } from './components/onboarding/OnboardingScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthScreen } from './components/auth/AuthScreen';
import { SwipeScreen } from './components/swipe/SwipeScreen';
import { StockScreen } from './components/stock/StockScreen';
import type { StockedRestaurant } from './components/stock/StockScreen';
import { AccountScreen } from './components/account/AccountScreen';
import { SocialScreen } from './components/social/SocialScreen';

const LazyMapView = lazy(() =>
  import.meta.env.VITE_MAP_PROVIDER === 'mapbox'
    ? import('./components/map/SimpleMapViewMapbox').then(m => ({ default: m.SimpleMapViewMapbox }))
    : import('./components/map/SimpleMapView').then(m => ({ default: m.SimpleMapView }))
);
import type { SwipeRestaurant } from './data/mockRestaurants';
import { MOCK_RESTAURANTS } from './data/mockRestaurants';
import * as api from './utils/api';
type Tab = 'home' | 'stock' | 'map' | 'social' | 'account';

/* ─── SVG Icons ─── */
function IconHome({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  );
}
function IconMap({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
function IconBookmark({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
    </svg>
  );
}
function IconSearch({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>
    </svg>
  );
}
function IconUser({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
    </svg>
  );
}

/* ─── Sidebar (PC) ─── */
function Sidebar({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: (a: boolean) => React.ReactNode }[] = [
    { key: 'home', label: 'ホーム', icon: (a) => <IconHome active={a} /> },
    { key: 'map', label: 'マップ', icon: (a) => <IconMap active={a} /> },
    { key: 'stock', label: '保存', icon: (a) => <IconBookmark active={a} /> },
    { key: 'social', label: '検索', icon: (a) => <IconSearch active={a} /> },
    { key: 'account', label: 'アカウント', icon: (a) => <IconUser active={a} /> },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-[220px] min-w-[220px] border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 h-svh sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-6">
        <img src="/app-icon.png" alt="ストグル" className="w-8 h-8 rounded-lg" />
        <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">ストグル</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 px-3 mt-2">
        {items.map(({ key, label, icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {icon(active)}
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom area */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-300 dark:text-gray-600">© 2026 ストグル</p>
      </div>
    </aside>
  );
}

/* ─── Bottom Tab (Mobile) ─── */
function BottomTab({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: (a: boolean) => React.ReactNode }[] = [
    { key: 'home', label: 'ホーム', icon: (a) => <IconHome active={a} /> },
    { key: 'map', label: 'マップ', icon: (a) => <IconMap active={a} /> },
    { key: 'stock', label: '保存', icon: (a) => <IconBookmark active={a} /> },
    { key: 'social', label: '検索', icon: (a) => <IconSearch active={a} /> },
    { key: 'account', label: 'アカウント', icon: (a) => <IconUser active={a} /> },
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
            {icon(active)}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MainApp() {
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = sessionStorage.getItem('activeTab') as Tab | null;
    return saved && ['home', 'stock', 'map', 'social', 'account'].includes(saved) ? saved : 'home';
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

  // 起動時にバックエンドからストック復元
  useEffect(() => {
    const mockMap = new Map(MOCK_RESTAURANTS.map((m) => [m.id, m]));
    api.fetchRestaurants().then((data: Record<string, unknown>[]) => {
      const restored: StockedRestaurant[] = data.map((r) => {
        const id = String(r.restaurantId ?? r.id);
        const mock = mockMap.get(id);
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
          visited: r.status === 'visited',
          pinned: !!r.pinned,
          stockedAt: String(r.createdAt ?? new Date().toISOString()),
          visitedAt: r.visitedAt ? String(r.visitedAt) : undefined,
        };
      });
      setStocks(restored);
    }).catch(() => {});
  }, []);

  const handleStock = useCallback((r: SwipeRestaurant) => {
    setStocks((prev) => {
      if (prev.some((s) => s.id === r.id)) return prev;
      return [...prev, { ...r, visited: false, stockedAt: new Date().toISOString() }];
    });
    api.putRestaurant({
      id: r.id, name: r.name, address: r.address, lat: r.lat, lng: r.lng,
      genre: r.genre, scene: r.scene, priceRange: r.priceRange, distance: r.distance,
      influencer: r.influencer, videoUrl: r.videoUrl, photoEmoji: r.photoEmoji, status: 'wishlist',
    }).catch((e) => console.warn('Failed to stock:', e));
  }, []);

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
  const refreshFeed = useCallback(() => setFeedRefreshKey(k => k + 1), []);
  const [socialInitView, setSocialInitView] = useState<string | null>(null);

  const handleShowOnMap = useCallback((lat: number, lng: number, restaurant?: StockedRestaurant) => {
    setPanTo({ lat, lng, restaurant });
    setTab('map');
  }, []);

  return (
    <div className="flex h-svh bg-white dark:bg-gray-900 overflow-hidden">
      {/* PC: Left Sidebar */}
      <Sidebar tab={tab} onTabChange={setTab} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          {tab === 'home' && <SwipeScreen onStock={handleStock} onRemoveStock={handleRemoveStock} onShowOnMap={handleShowOnMap} onOpenNotifications={() => { setSocialInitView('notifications'); setTab('social'); }} userPosition={position} stockedIds={stockedIds} refreshKey={feedRefreshKey} />}
          {tab === 'stock' && (
            <StockScreen
              stocks={stocks}
              onMarkVisited={handleMarkVisited}
              onUnmarkVisited={handleUnmarkVisited}
              onRemoveStock={handleRemoveStock}
              onTogglePin={handleTogglePin}
              onShowOnMap={handleShowOnMap}
              userPosition={position}
            />
          )}
          {tab === 'map' && (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><p className="text-gray-400">マップを読み込み中...</p></div>}>
              <LazyMapView
                stocks={stocks}
                panTo={panTo}
                onPanComplete={() => setPanTo(null)}
                userPosition={position}
              />
            </Suspense>
          )}
          {tab === 'social' && (
            <SocialScreen initialView={socialInitView} onInitViewConsumed={() => setSocialInitView(null)} onGoHome={() => setTab('home')} />
          )}
          {tab === 'account' && (
            <AccountScreen stocks={stocks} onRestaurantEdited={refreshFeed} />
          )}
        </main>

        {/* Mobile: Bottom Tab */}
        <BottomTab tab={tab} onTabChange={setTab} />
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(() =>
    localStorage.getItem('onboarding_done') === '1'
  );

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
        <p className="text-gray-400 dark:text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  if (!onboardingDone) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return <ErrorBoundary><MainApp /></ErrorBoundary>;
}
