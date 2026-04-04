import { useState, useCallback, useEffect, useRef } from 'react';
import { SwipeCard } from './SwipeCard';
import { FilterOverlay } from './FilterOverlay';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

// トランプシャッフル音（Web Audio API）
function createShuffleSound() {
  const ctx = new AudioContext();
  const totalDur = 1.1;
  const flicks = 10;

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

// 効果音を生成（Web Audio API）
function createSwipeSound(type: 'like' | 'nope') {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'like') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else {
    // シュッ: ホワイトノイズ + バンドパスで空気を切る音
    osc.disconnect();
    const dur = 0.25;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1000, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(6000, ctx.currentTime + 0.08);
    bp.frequency.exponentialRampToValueAtTime(10000, ctx.currentTime + dur);
    bp.Q.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
    noise.connect(bp);
    bp.connect(gain);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + dur);
  }
}

interface Props {
  onStock: (restaurant: SwipeRestaurant) => void;
  onNope?: () => void;
  onRemoveStock: (id: string) => void;
  userPosition: GPSPosition | null;
  stockedIds: string[];
}

function getDistance(userPos: GPSPosition | null, r: SwipeRestaurant): string {
  if (!userPos) return r.distance;
  return formatDistance(distanceMetres(userPos.lat, userPos.lng, r.lat, r.lng));
}

export function SwipeScreen({ onStock, onNope, onRemoveStock, userPosition, stockedIds }: Props) {
  const [cards, setCards] = useState<SwipeRestaurant[]>([...MOCK_RESTAURANTS]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [buttonFlyOut, setButtonFlyOut] = useState<'left' | 'right' | null>(null);
  const [nopedIds, setNopedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<{ id: string; direction: 'left' | 'right' }[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);

  // フィルター確定時（「この条件で探す」ボタン）にインクリメント
  const applyFilter = useCallback(() => {
    setFilterVersion((v) => v + 1);
    setFilterOpen(false);
  }, []);

  // カードフィルタリング（stockedIds/nopedIds変更時はアニメなし）
  useEffect(() => {
    let filtered = [...MOCK_RESTAURANTS];
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
    setCards(filtered);
    setCurrentIndex(0);
  }, [stockedIds, nopedIds, selectedScenes, selectedGenres]);

  // フィルター確定時のみシャッフルアニメーション+音
  useEffect(() => {
    if (filterVersion === 0) return;
    setShuffling(true);
    createShuffleSound();
    setTimeout(() => setShuffling(false), 1200);
  }, [filterVersion]);

  const handleSwipeComplete = useCallback(
    (direction: 'left' | 'right') => {
      const current = cards[currentIndex];
      if (!current) return;

      createSwipeSound(direction === 'right' ? 'like' : 'nope');

      setHistory((h) => [...h, { id: current.id, direction }]);

      if (direction === 'right') {
        onStock(current);
      } else {
        setNopedIds((prev) => new Set(prev).add(current.id));
        onNope?.();
      }

      setButtonFlyOut(null);
      setCurrentIndex((i) => i + 1);
    },
    [cards, currentIndex, onStock, onNope],
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    if (last.direction === 'left') {
      // ×を取り消す → nopedIdsから削除
      setNopedIds((prev) => {
        const next = new Set(prev);
        next.delete(last.id);
        return next;
      });
    } else {
      // いいねを取り消す → ストックから削除
      onRemoveStock(last.id);
    }
  }, [history, onRemoveStock]);

  const handleButtonSwipe = (direction: 'left' | 'right') => {
    if (buttonFlyOut) return;
    setButtonFlyOut(direction);
  };

  const current = cards[currentIndex];
  const next = cards[currentIndex + 1];
  const isFinished = currentIndex >= cards.length;

  const filterCount = selectedScenes.length + selectedGenres.length;

  return (
    <div className="flex-1 flex flex-col items-center relative bg-white">
      {/* Filter bar */}
      <div className="w-full flex items-center gap-2 px-4 py-3 flex-shrink-0">
        <button
          onClick={() => setFilterOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
          絞り込み
          {filterCount > 0 && (
            <span className="bg-gray-900 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-start w-full px-4 pt-4 min-h-0 overflow-hidden">
        {shuffling ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* シャッフルアニメーション */}
            <div className="relative w-[200px] h-[280px]">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 shadow-md"
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
            <p className="text-gray-300 text-6xl font-thin mb-4">0</p>
            <p className="text-gray-800 font-semibold text-base mb-1">全部見たよ</p>
            <p className="text-gray-400 text-xs mb-6">また後でチェックしてね</p>
            <button
              onClick={() => setCurrentIndex(0)}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-full text-xs font-medium"
            >
              もう一度見る
            </button>
          </div>
        ) : (
          <>
            <div className="relative w-full max-w-[320px] h-[460px] flex-shrink-0">
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
                  active={!buttonFlyOut || true}
                  flyOut={buttonFlyOut}
                />
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-10 pt-6 pb-4 flex-shrink-0">
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              </button>
              <button
                onClick={() => handleButtonSwipe('left')}
                disabled={!!buttonFlyOut}
                className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button
                onClick={() => handleButtonSwipe('right')}
                disabled={!!buttonFlyOut}
                className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
              </button>
              <div className="w-10" /> {/* spacer for symmetry */}
            </div>
          </>
        )}
      </div>

      {filterOpen && (
        <FilterOverlay
          selectedScenes={selectedScenes}
          selectedGenres={selectedGenres}
          onScenesChange={setSelectedScenes}
          onGenresChange={setSelectedGenres}
          onClose={applyFilter}
          onDismiss={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
