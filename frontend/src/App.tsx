import { useState, useCallback } from 'react';
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
  const [swipeStats, setSwipeStats] = useState({ total: 0, likes: 0 });
  const [panTo, setPanTo] = useState<{ lat: number; lng: number } | null>(null);
  const { position } = useGPS();

  const handleStock = useCallback((r: SwipeRestaurant) => {
    setStocks((prev) => {
      if (prev.some((s) => s.id === r.id)) return prev;
      return [...prev, { ...r, visited: false, stockedAt: new Date().toISOString() }];
    });
    setSwipeStats((s) => ({ total: s.total + 1, likes: s.likes + 1 }));
  }, []);

  const handleNope = useCallback(() => {
    setSwipeStats((s) => ({ total: s.total + 1, likes: s.likes }));
  }, []);

  const handleMarkVisited = useCallback((id: string) => {
    setStocks((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, visited: true, visitedAt: new Date().toISOString() } : s
      ),
    );
  }, []);

  const handleRemoveStock = useCallback((id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleShowOnMap = useCallback((lat: number, lng: number) => {
    setPanTo({ lat, lng });
    setTab('map');
  }, []);

  const visitedCount = stocks.filter((s) => s.visited).length;
  const likeRate = swipeStats.total > 0 ? Math.round((swipeStats.likes / swipeStats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-svh bg-white max-w-xl mx-auto overflow-hidden">
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'home' && <SwipeScreen onStock={handleStock} onNope={handleNope} userPosition={position} stockedIds={stocks.map(s => s.id)} />}
        {tab === 'stock' && (
          <StockScreen
            stocks={stocks}
            onMarkVisited={handleMarkVisited}
            onRemoveStock={handleRemoveStock}
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
          <AccountScreen
            stockCount={stocks.length}
            visitedCount={visitedCount}
            likeRate={likeRate}
          />
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
