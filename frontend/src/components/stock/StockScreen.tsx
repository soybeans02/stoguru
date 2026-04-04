import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

export interface StockedRestaurant extends SwipeRestaurant {
  visited: boolean;
  stockedAt: string;
  visitedAt?: string;
}

interface Props {
  stocks: StockedRestaurant[];
  onMarkVisited: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onShowOnMap: (lat: number, lng: number) => void;
  userPosition: GPSPosition | null;
}

export function StockScreen({ stocks, onMarkVisited, onRemoveStock, onShowOnMap, userPosition }: Props) {
  const visitedCount = stocks.filter((s) => s.visited).length;

  return (
    <div className="flex-1 overflow-y-auto overscroll-none px-4 py-5 bg-white">
      <h1 className="text-lg font-bold text-gray-900 mb-0.5">ストック</h1>
      <p className="text-xs text-gray-400 mb-5">
        {stocks.length}件 · うち{visitedCount}件 行った
      </p>

      {stocks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-300 text-5xl font-thin mb-3">0</p>
          <p className="text-gray-500 text-sm">まだストックがないよ</p>
          <p className="text-gray-400 text-xs mt-1">ホームで気になる店をスワイプしよう</p>
        </div>
      ) : (
        <div className="space-y-2">
          {stocks.map((s) => (
            <div
              key={s.id}
              className="flex gap-3 bg-gray-50 rounded-xl p-3.5 relative"
            >
              <button
                onClick={() => { if (window.confirm(`「${s.name}」をストックから削除する？`)) onRemoveStock(s.id); }}
                className="absolute top-2.5 right-2.5 text-gray-300 hover:text-red-400 transition-colors p-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              {s.visited && (
                <div className="absolute top-9 right-2.5 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-medium">
                  visited
                </div>
              )}
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                  s.visited ? 'bg-green-50' : 'bg-gray-200'
                }`}
              >
                {s.photoEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{s.name}</h3>
                <p className="text-[11px] text-gray-400 mb-2 truncate">
                  {userPosition ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng)) : s.distance} · {s.genre}
                </p>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => onShowOnMap(s.lat, s.lng)}
                    className="text-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium active:scale-95 transition-transform"
                  >
                    マップ
                  </button>
                  <button
                    onClick={() => window.open(s.videoUrl, '_blank')}
                    className="text-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium active:scale-95 transition-transform"
                  >
                    動画
                  </button>
                  {!s.visited && (
                    <button
                      onClick={() => onMarkVisited(s.id)}
                      className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white font-medium active:scale-95 transition-transform"
                    >
                      行った
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
