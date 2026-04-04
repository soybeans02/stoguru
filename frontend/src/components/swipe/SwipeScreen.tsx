import { useState, useCallback, useEffect } from 'react';
import { SwipeCard } from './SwipeCard';
import { FilterOverlay } from './FilterOverlay';
import { MOCK_RESTAURANTS } from '../../data/mockRestaurants';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';

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
  userPosition: GPSPosition | null;
}

function getDistance(userPos: GPSPosition | null, r: SwipeRestaurant): string {
  if (!userPos) return r.distance;
  return formatDistance(distanceMetres(userPos.lat, userPos.lng, r.lat, r.lng));
}

export function SwipeScreen({ onStock, onNope, userPosition }: Props) {
  const [cards, setCards] = useState<SwipeRestaurant[]>([...MOCK_RESTAURANTS]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [buttonFlyOut, setButtonFlyOut] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    let filtered = [...MOCK_RESTAURANTS];
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
  }, [selectedScenes, selectedGenres]);

  const handleSwipeComplete = useCallback(
    (direction: 'left' | 'right') => {
      const current = cards[currentIndex];
      if (!current) return;

      createSwipeSound(direction === 'right' ? 'like' : 'nope');

      if (direction === 'right') {
        onStock(current);
      } else {
        onNope?.();
      }

      setButtonFlyOut(null);
      setCurrentIndex((i) => i + 1);
    },
    [cards, currentIndex, onStock, onNope],
  );

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
        {isFinished ? (
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
            <div className="relative w-full max-w-[300px] h-[340px] flex-shrink-0">
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
            <div className="flex items-center gap-16 pt-14 pb-4 flex-shrink-0">
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
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
