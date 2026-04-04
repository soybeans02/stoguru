import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useGPS } from './hooks/useGPS';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthScreen } from './components/auth/AuthScreen';
import { SwipeScreen } from './components/swipe/SwipeScreen';
import { StockScreen } from './components/stock/StockScreen';
import type { StockedRestaurant } from './components/stock/StockScreen';
import { SimpleMapView } from './components/map/SimpleMapView';
import { AccountScreen } from './components/account/AccountScreen';
import type { SwipeRestaurant } from './data/mockRestaurants';
import * as api from './utils/api';
type Tab = 'home' | 'stock' | 'map' | 'account';

function TabButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-1.5 px-3 transition-colors ${active ? 'text-gray-900' : 'text-gray-300'}`}
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function MainApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [stocks, setStocks] = useState<StockedRestaurant[]>([]);
  const [panTo, setPanTo] = useState<{ lat: number; lng: number } | null>(null);
  const { position } = useGPS();

  // 起動時にバックエンドからストック復元
  useEffect(() => {
    api.fetchRestaurants().then((data: Record<string, unknown>[]) => {
      const restored: StockedRestaurant[] = data.map((r) => ({
        id: String(r.restaurantId ?? r.id),
        name: String(r.name ?? ''),
        address: String(r.address ?? ''),
        lat: Number(r.lat ?? 0),
        lng: Number(r.lng ?? 0),
        genre: String(r.genre ?? ''),
        scene: Array.isArray(r.scene) ? r.scene as string[] : [],
        priceRange: String(r.priceRange ?? ''),
        distance: String(r.distance ?? ''),
        influencer: (r.influencer as SwipeRestaurant['influencer']) ?? { name: '', handle: '', platform: 'tiktok' as const },
        videoUrl: String(r.videoUrl ?? ''),
        photoEmoji: String(r.photoEmoji ?? '🍽️'),
        visited: r.status === 'visited',
        pinned: !!r.pinned,
        stockedAt: String(r.createdAt ?? new Date().toISOString()),
        visitedAt: r.visitedAt ? String(r.visitedAt) : undefined,
      }));
      setStocks(restored);
    }).catch(() => {});
  }, []);

  const handleStock = useCallback((r: SwipeRestaurant) => {
    setStocks((prev) => {
      if (prev.some((s) => s.id === r.id)) return prev;
      return [...prev, { ...r, visited: false, stockedAt: new Date().toISOString() }];
    });
    // バックエンドに保存
    api.putRestaurant({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      genre: r.genre,
      scene: r.scene,
      priceRange: r.priceRange,
      distance: r.distance,
      influencer: r.influencer,
      videoUrl: r.videoUrl,
      photoEmoji: r.photoEmoji,
      status: 'wishlist',
    }).catch(() => {});
  }, []);

  const handleNope = useCallback(() => {}, []);

  const handleMarkVisited = useCallback((id: string) => {
    setStocks((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, visited: true, visitedAt: new Date().toISOString() } : s
      ),
    );
    // バックエンドも更新
    api.fetchRestaurants().then((data: Record<string, unknown>[]) => {
      const existing = data.find((r) => String(r.restaurantId ?? r.id) === id);
      if (existing) {
        api.putRestaurant({ ...existing, id, status: 'visited', visitedAt: new Date().toISOString() }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleRemoveStock = useCallback((id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
    api.deleteRestaurant(id).catch(() => {});
  }, []);

  const handleTogglePin = useCallback((id: string) => {
    setStocks((prev) =>
      prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s)
    );
    // バックエンドにもpinned状態を保存
    const stock = stocks.find((s) => s.id === id);
    if (stock) {
      api.putRestaurant({
        id,
        name: stock.name,
        address: stock.address,
        lat: stock.lat,
        lng: stock.lng,
        genre: stock.genre,
        status: stock.visited ? 'visited' : 'wishlist',
        pinned: !stock.pinned,
      }).catch(() => {});
    }
  }, [stocks]);

  const handleShowOnMap = useCallback((lat: number, lng: number) => {
    setPanTo({ lat, lng });
    setTab('map');
  }, []);

  return (
    <div className="flex flex-col h-svh bg-white max-w-xl mx-auto overflow-hidden">
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'home' && <SwipeScreen onStock={handleStock} onNope={handleNope} onRemoveStock={handleRemoveStock} userPosition={position} stockedIds={stocks.map(s => s.id)} />}
        {tab === 'stock' && (
          <StockScreen
            stocks={stocks}
            onMarkVisited={handleMarkVisited}
            onRemoveStock={handleRemoveStock}
            onTogglePin={handleTogglePin}
            onShowOnMap={handleShowOnMap}
            userPosition={position}
          />
        )}
        {tab === 'map' && (
          <SimpleMapView
            stocks={stocks}
            panTo={panTo}
            onPanComplete={() => setPanTo(null)}
            userPosition={position}
          />
        )}
        {tab === 'account' && (
          <AccountScreen stocks={stocks} />
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="flex items-center justify-around bg-white border-t border-gray-100 h-14 flex-shrink-0 safe-area-bottom">
        <TabButton active={tab === 'home'} onClick={() => setTab('home')} label="ホーム">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'home' ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </TabButton>
        <TabButton active={tab === 'stock'} onClick={() => setTab('stock')} label="ストック">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'stock' ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
        </TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')} label="マップ">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'map' ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
        </TabButton>
        <TabButton active={tab === 'account'} onClick={() => setTab('account')} label="アカウント">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'account' ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
        </TabButton>
      </nav>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return <ErrorBoundary><MainApp /></ErrorBoundary>;
}
