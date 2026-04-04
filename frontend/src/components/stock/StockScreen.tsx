import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { GENRE_EMOJI } from '../../data/mockRestaurants';

export interface StockedRestaurant extends SwipeRestaurant {
  visited: boolean;
  stockedAt: string;
  visitedAt?: string;
}

interface Props {
  stocks: StockedRestaurant[];
  onMarkVisited: (id: string) => void;
  onShowOnMap: (lat: number, lng: number) => void;
}

export function StockScreen({ stocks, onMarkVisited, onShowOnMap }: Props) {
  const visitedCount = stocks.filter((s) => s.visited).length;

  return (
    <div className="flex-1 overflow-y-auto overscroll-none px-4 py-5 bg-gray-50">
      <h1 className="text-xl font-bold text-gray-900 mb-1">📋 ストック</h1>
      <p className="text-xs text-gray-400 mb-5">
        {stocks.length}件 ・ うち{visitedCount}件 行った
      </p>

      {stocks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="text-gray-500 text-sm">まだストックがないよ</p>
          <p className="text-gray-400 text-xs mt-1">ホームでスワイプして気になる店を○しよう</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stocks.map((s) => {
            const emoji = GENRE_EMOJI[s.genre] ?? '🍽️';
            return (
              <div
                key={s.id}
                className="flex gap-3 bg-white rounded-xl p-3.5 shadow-sm relative"
              >
                {s.visited && (
                  <div className="absolute top-2.5 right-2.5 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-md font-bold">
                    ✓ 行った
                  </div>
                )}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{
                    background: s.visited
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                      : 'linear-gradient(135deg, #fbbf24, #f97316)',
                  }}
                >
                  {emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{s.name}</h3>
                  <p className="text-[11px] text-gray-400 mb-2 truncate">
                    📍 {s.distance} ・ {emoji} {s.genre}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => onShowOnMap(s.lat, s.lng)}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-orange-500 text-white font-medium"
                    >
                      📍 マップ
                    </button>
                    <button
                      onClick={() => window.open(s.videoUrl, '_blank')}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-medium"
                    >
                      ▶ 動画
                    </button>
                    {!s.visited && (
                      <button
                        onClick={() => onMarkVisited(s.id)}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-green-500 text-white font-medium"
                      >
                        ✓ 行った
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
