import { useState, useCallback, useRef, useEffect } from 'react';
import { SwipeCard } from './SwipeCard';
import { FilterOverlay } from './FilterOverlay';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { fetchRestaurantFeed, getNotifications } from '../../utils/api';

// 共有AudioContext（lazy初期化でリソースリーク防止）
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

// Nope風切り音（mp3）
let whooshBuffer: AudioBuffer | null = null;
fetch('/sounds/whoosh.mp3')
  .then(r => r.arrayBuffer())
  .then(buf => getAudioContext().decodeAudioData(buf))
  .then(decoded => { whooshBuffer = decoded; })
  .catch(() => {});

// スワイプ効果音
function createSwipeSound(type: 'like' | 'nope') {
  const ctx = getAudioContext();

  if (type === 'like') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else if (whooshBuffer) {
    const source = ctx.createBufferSource();
    source.buffer = whooshBuffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  }
}


// トランプシャッフル音
function createShuffleSound() {
  const ctx = getAudioContext();
  const totalDur = 1.4;
  const flicks = 8;
  for (let i = 0; i < flicks; i++) {
    const t = ctx.currentTime + (i / flicks) * totalDur;
    const dur = 0.05 + Math.random() * 0.04;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < bufferSize; j++) {
      data[j] = (Math.random() * 2 - 1) * (1 - j / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000 + Math.random() * 3000;
    bp.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 + Math.random() * 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  }
}

interface Props {
  onStock: (restaurant: SwipeRestaurant) => void;
  onRemoveStock: (id: string) => void;
  onShowOnMap?: (lat: number, lng: number, restaurant?: any) => void;
  onOpenNotifications?: () => void;
  /// 任意：戻るボタン用ハンドラ。Discovery Home から開かれた時のみ渡す
  onBack?: () => void;
  userPosition: GPSPosition | null;
  stockedIds: string[];
  refreshKey?: number;
}

function getDistance(userPos: GPSPosition | null, r: SwipeRestaurant): string {
  if (!userPos) return r.distance;
  return formatDistance(distanceMetres(userPos.lat, userPos.lng, r.lat, r.lng));
}

export function SwipeScreen({ onStock, onRemoveStock, onShowOnMap, onOpenNotifications, onBack, userPosition, stockedIds, refreshKey }: Props) {
  const [allRestaurants, setAllRestaurants] = useState<SwipeRestaurant[]>([]);
  const [cards, setCards] = useState<SwipeRestaurant[]>([]);
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(10000);
  const [buttonFlyOut, setButtonFlyOut] = useState<'left' | 'right' | 'up' | null>(null);
  // nopedMap: { [id]: timestamp } — 1週間経過したら自動復活
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const [nopedMap, setNopedMap] = useState<Record<string, number>>(() => {
    try {
      const now = Date.now();
      // 新形式（nopedMap）を優先的に読む
      const mapSaved = localStorage.getItem('nopedMap');
      if (mapSaved) {
        const map = JSON.parse(mapSaved) as Record<string, number>;
        const active: Record<string, number> = {};
        for (const [id, ts] of Object.entries(map)) {
          if (now - ts < ONE_WEEK) active[id] = ts;
        }
        return active;
      }
      // 旧形式（nopedIds: string[]）からのマイグレーション
      const oldSaved = localStorage.getItem('nopedIds');
      if (oldSaved) {
        const parsed = JSON.parse(oldSaved);
        if (Array.isArray(parsed)) {
          const map: Record<string, number> = {};
          parsed.forEach((id: string) => { map[id] = now; });
          localStorage.setItem('nopedMap', JSON.stringify(map));
          localStorage.removeItem('nopedIds');
          return map;
        }
      }
      return {};
    } catch { return {}; }
  });
  // nopedMapからアクティブなIDのSetを導出
  const nopedIds = new Set(Object.keys(nopedMap));
  const [history, setHistory] = useState<{ id: string; direction: 'left' | 'right' }[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const shuffleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedFetched = useRef(false);

  // 未読通知カウント取得
  useEffect(() => {
    getNotifications().then(n => setUnreadNotif(n.filter(x => !x.read).length)).catch(() => {});
  }, []);

  // APIからフィード取得（位置情報が取れたら1回だけ）
  useEffect(() => {
    if (feedFetched.current) return;
    if (!userPosition) return;
    feedFetched.current = true;
    setLoading(true);
    fetchRestaurantFeed(userPosition.lat, userPosition.lng, 1000)
      .then((data: SwipeRestaurant[]) => {
        const restaurants = data.length > 0 ? data : MOCK_RESTAURANTS;
        setAllRestaurants(restaurants);
        const excludeIds = new Set([...stockedIds, ...nopedIds]);
        setCards(restaurants.filter((r) => !excludeIds.has(r.id)));
      })
      .catch(() => {
        setAllRestaurants(MOCK_RESTAURANTS);
        const excludeIds = new Set([...stockedIds, ...nopedIds]);
        setCards(MOCK_RESTAURANTS.filter((r) => !excludeIds.has(r.id)));
      })
      .finally(() => setLoading(false));
  }, [userPosition, stockedIds, nopedMap]);

  // refreshKeyが変わったらフィード再取得
  useEffect(() => {
    if (!refreshKey || !userPosition) return;
    fetchRestaurantFeed(userPosition.lat, userPosition.lng, 1000)
      .then((data: SwipeRestaurant[]) => {
        const restaurants = data.length > 0 ? data : MOCK_RESTAURANTS;
        setAllRestaurants(restaurants);
        const excludeIds = new Set([...stockedIds, ...nopedIds]);
        const filtered = restaurants.filter((r) => !excludeIds.has(r.id));
        setCards(filtered);
        setCurrentIndex(0);
      })
      .catch(() => {});
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 位置情報なしの場合、3秒後にモックデータにフォールバック
  useEffect(() => {
    if (feedFetched.current) return;
    const timer = setTimeout(() => {
      if (feedFetched.current) return;
      feedFetched.current = true;
      setAllRestaurants(MOCK_RESTAURANTS);
      const excludeIds = new Set([...stockedIds, ...nopedIds]);
      setCards(MOCK_RESTAURANTS.filter((r) => !excludeIds.has(r.id)));
      setLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [stockedIds, nopedMap]);

  // nopedMapをlocalStorageに永続化
  useEffect(() => {
    localStorage.setItem('nopedMap', JSON.stringify(nopedMap));
  }, [nopedMap]);

  // カード再フィルタ（共通ロジック）
  const refilter = useCallback(() => {
    let filtered = [...allRestaurants];
    const excludeIds = new Set([...stockedIds, ...nopedIds]);
    filtered = filtered.filter((r) => !excludeIds.has(r.id));
    if (selectedScenes.length > 0) {
      filtered = filtered.filter((r) =>
        r.scene.some((s) => selectedScenes.includes(s))
      );
    }
    if (selectedGenres.length > 0) {
      filtered = filtered.filter((r) => selectedGenres.includes(r.genre));
    }
    if (priceMin > 0 || priceMax < 10000) {
      filtered = filtered.filter((r) => {
        const price = parseInt(r.priceRange.replace(/[^0-9]/g, '')) || 0;
        return price >= priceMin && price <= priceMax;
      });
    }
    setCards(filtered);
    setCurrentIndex(0);
    return filtered;
  }, [allRestaurants, stockedIds, nopedMap, selectedScenes, selectedGenres, priceMin, priceMax]);

  // 「この条件で探す」ボタンから呼ばれる
  const applyFilter = useCallback(() => {
    setFilterOpen(false);
    const filtered = refilter();
    if (filtered.length > 0) {
      setShuffling(true);
      createShuffleSound();
      if (shuffleTimer.current) clearTimeout(shuffleTimer.current);
      shuffleTimer.current = setTimeout(() => setShuffling(false), 1500);
    }
  }, [refilter]);

  const handleSwipeComplete = useCallback(
    (direction: 'left' | 'right' | 'up') => {
      const current = cards[currentIndex];
      if (!current) return;

      if (direction === 'up') {
        // 上スワイプ → マップに飛ぶ（カードは消費しない）
        createSwipeSound('like');
        // StockedRestaurant互換のオブジェクトを作ってポップアップ表示
        const mapRestaurant = {
          id: current.id,
          name: current.name,
          lat: current.lat,
          lng: current.lng,
          genre: current.genre || '',
          scene: current.scene || [],
          priceRange: current.priceRange || '',
          distance: getDistance(userPosition, current),
          videoUrl: current.videoUrl || '',
          photoEmoji: current.photoEmoji || '',
          photoUrls: current.photoUrls || [],
          visited: false,
          pinned: false,
          stockedAt: '',
        };
        onShowOnMap?.(current.lat, current.lng, mapRestaurant as any);
        return;
      }

      createSwipeSound(direction === 'right' ? 'like' : 'nope');
      setHistory((h) => [...h, { id: current.id, direction }]);

      if (direction === 'right') {
        onStock(current);
      } else {
        setNopedMap((prev) => ({ ...prev, [current.id]: Date.now() }));
      }

      setButtonFlyOut(null);
      setCurrentIndex((i) => i + 1);
    },
    [cards, currentIndex, onStock, onShowOnMap],
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || currentIndex <= 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentIndex((i) => i - 1);
    if (last.direction === 'left') {
      // ×を取り消す → nopedMapから削除
      setNopedMap((prev) => {
        const next = { ...prev };
        delete next[last.id];
        return next;
      });
    } else {
      // いいねを取り消す → ストックから削除
      onRemoveStock(last.id);
    }
  }, [history, currentIndex, onRemoveStock]);

  const handleButtonSwipe = (direction: 'left' | 'right' | 'up') => {
    if (buttonFlyOut) return;
    setButtonFlyOut(direction);
  };

  const current = cards[currentIndex];
  const next = cards[currentIndex + 1];
  const isFinished = currentIndex >= cards.length;

  const priceActive = priceMin > 0 || priceMax < 10000 ? 1 : 0;
  const filterCount = selectedScenes.length + selectedGenres.length + priceActive;

  return (
    <div className="flex-1 flex flex-col items-center relative bg-white dark:bg-gray-900">
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="戻る"
              className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          <button
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
            絞り込み
            {filterCount > 0 && (
              <span className="bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* 通知ベル */}
          <button onClick={onOpenNotifications} className="relative p-1.5 text-gray-500 dark:text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            {unreadNotif > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadNotif}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-start w-full px-4 pt-4 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-8 h-8 border-2 border-gray-200 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin mb-4" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">近くのお店を探しています...</p>
          </div>
        ) : shuffling ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-[200px] h-[280px]">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 border border-gray-200 dark:border-gray-600 shadow-md"
                  style={{
                    animation: `shuffle-${i % 2 === 0 ? 'left' : 'right'} 0.3s ease-in-out ${i * 0.12}s infinite alternate`,
                    zIndex: 6 - i,
                    transform: `rotate(${(i - 2.5) * 3}deg)`,
                  }}
                />
              ))}
              <style>{`
                @keyframes shuffle-left {
                  0% { transform: translateX(0) rotate(-3deg); }
                  100% { transform: translateX(-30px) rotate(-8deg); }
                }
                @keyframes shuffle-right {
                  0% { transform: translateX(0) rotate(3deg); }
                  100% { transform: translateX(30px) rotate(8deg); }
                }
              `}</style>
            </div>
            <p className="text-gray-400 text-sm mt-6 font-medium">シャッフル中...</p>
          </div>
        ) : isFinished ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-gray-300 dark:text-gray-600 text-6xl font-thin mb-4">0</p>
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-base mb-1">全部見たよ</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mb-6">また後でチェックしてね</p>
            <button
              onClick={() => refilter()}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-xs font-medium transition-colors"
            >
              もう一度見る
            </button>
          </div>
        ) : (
          <>
            {/* 高さは固定 px だと iPhone SE/8 などの小型端末でヘッダー + 下部タブを引いた残りに収まらないので min(目標, svh-余白) で逃がす */}
            <div className="relative w-full max-w-[380px] md:max-w-[440px] lg:max-w-[500px] h-[min(560px,calc(100svh-180px))] md:h-[min(620px,calc(100svh-180px))] lg:h-[min(680px,calc(100svh-180px))] flex-shrink-0">
              {next && (
                <SwipeCard
                  key={`next-${next.id}`}
                  restaurant={next}
                  distance={getDistance(userPosition, next)}
                  onSwipeComplete={() => {}}
                  active={false}
                />
              )}
              {current && (
                <SwipeCard
                  key={`card-${current.id}`}
                  restaurant={current}
                  distance={getDistance(userPosition, current)}
                  onSwipeComplete={handleSwipeComplete}
                  active={true}
                  flyOut={buttonFlyOut}
                />
              )}
              {/* Swipe Buttons (overlaid inside card) */}
              <div
                className="absolute bottom-3.5 left-0 right-0 z-20 flex items-center justify-center gap-5"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button
                  onClick={() => handleButtonSwipe('left')}
                  disabled={!!buttonFlyOut}
                  className="w-[52px] h-[52px] rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <button
                  onClick={() => handleButtonSwipe('right')}
                  disabled={!!buttonFlyOut}
                  className="w-[52px] h-[52px] rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#f97316" stroke="#f97316" strokeWidth="0"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </button>
                <button
                  onClick={() => handleButtonSwipe('up')}
                  disabled={!!buttonFlyOut}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {filterOpen && (
        <FilterOverlay
          selectedScenes={selectedScenes}
          selectedGenres={selectedGenres}
          priceMin={priceMin}
          priceMax={priceMax}
          onScenesChange={setSelectedScenes}
          onGenresChange={setSelectedGenres}
          onPriceChange={(min, max) => { setPriceMin(min); setPriceMax(max); }}
          onClose={() => setFilterOpen(false)}
          onApply={applyFilter}
        />
      )}
    </div>
  );
}
