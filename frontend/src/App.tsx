import { useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthScreen } from './components/auth/AuthScreen';
import { SwipeScreen } from './components/swipe/SwipeScreen';
import { StockScreen } from './components/stock/StockScreen';
import type { StockedRestaurant } from './components/stock/StockScreen';
import { SimpleMapView } from './components/map/SimpleMapView';
import { AccountScreen } from './components/account/AccountScreen';
import type { SwipeRestaurant } from './data/mockRestaurants';
import { Home, Bookmark, MapPin, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tab = 'home' | 'stock' | 'map' | 'account';

const TAB_ITEMS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: 'home', icon: Home, label: 'ホーム' },
  { id: 'stock', icon: Bookmark, label: 'ストック' },
  { id: 'map', icon: MapPin, label: 'マップ' },
  { id: 'account', icon: User, label: 'アカウント' },
];

function MainApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [stocks, setStocks] = useState<StockedRestaurant[]>([]);
  const [swipeStats, setSwipeStats] = useState({ total: 0, likes: 0 });
  const [panTo, setPanTo] = useState<{ lat: number; lng: number } | null>(null);

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

  const handleShowOnMap = useCallback((lat: number, lng: number) => {
    setPanTo({ lat, lng });
    setTab('map');
  }, []);

  const visitedCount = stocks.filter((s) => s.visited).length;
  const likeRate = swipeStats.total > 0 ? Math.round((swipeStats.likes / swipeStats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-svh bg-gray-50 max-w-xl mx-auto overflow-hidden">
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'home' && <SwipeScreen onStock={handleStock} onNope={handleNope} />}
        {tab === 'stock' && (
          <StockScreen
            stocks={stocks}
            onMarkVisited={handleMarkVisited}
            onShowOnMap={handleShowOnMap}
          />
        )}
        {tab === 'map' && (
          <SimpleMapView
            stocks={stocks}
            panTo={panTo}
            onPanComplete={() => setPanTo(null)}
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
      <nav className="flex items-center justify-around bg-white border-t border-gray-200 h-16 flex-shrink-0 safe-area-bottom">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-3 transition-colors ${
                tab === item.id ? 'text-orange-500' : 'text-gray-400'
              }`}
            >
              <Icon size={22} strokeWidth={tab === item.id ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
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
