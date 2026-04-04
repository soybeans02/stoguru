import { useState, useRef, useCallback, useEffect } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { GENRE_EMOJI } from '../../data/mockRestaurants';

interface Props {
  restaurant: SwipeRestaurant;
  onSwipe: (direction: 'left' | 'right') => void;
  active: boolean;
}

export function SwipeCard({ restaurant, onSwipe, active }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const SWIPE_THRESHOLD = 100;

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!active) return;
    setDragging(true);
    startPos.current = { x: clientX, y: clientY };
  }, [active]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging) return;
    setOffset({
      x: clientX - startPos.current.x,
      y: clientY - startPos.current.y,
    });
  }, [dragging]);

  const handleEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(offset.x) > SWIPE_THRESHOLD) {
      onSwipe(offset.x > 0 ? 'right' : 'left');
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }, [dragging, offset.x, onSwipe]);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const onMouseUp = () => handleEnd();

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();

  // Global mouse up
  useEffect(() => {
    if (!dragging) return;
    const up = () => handleEnd();
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, handleEnd]);

  const rotation = offset.x * 0.1;
  const opacity = Math.max(0, 1 - Math.abs(offset.x) / 300);

  const platformLabel = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
  }[restaurant.influencer.platform];

  const genreEmoji = GENRE_EMOJI[restaurant.genre] ?? '🍽️';

  return (
    <div
      ref={cardRef}
      className="absolute inset-0 select-none"
      style={{
        transform: active
          ? `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`
          : 'scale(0.95) translateY(8px)',
        transition: dragging ? 'none' : 'transform 0.3s ease-out',
        opacity: active ? opacity : 0.5,
        zIndex: active ? 10 : 5,
        cursor: active ? 'grab' : 'default',
        touchAction: 'none',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="w-full h-full bg-white rounded-2xl overflow-hidden shadow-xl">
        {/* Swipe overlay labels */}
        {offset.x > 30 && (
          <div className="absolute top-5 left-4 z-20 border-3 border-green-500 text-green-500 bg-white/90 px-4 py-1 rounded-lg text-xl font-extrabold -rotate-12">
            ○ 気になる
          </div>
        )}
        {offset.x < -30 && (
          <div className="absolute top-5 right-4 z-20 border-3 border-red-500 text-red-500 bg-white/90 px-4 py-1 rounded-lg text-xl font-extrabold rotate-12">
            ✕ スキップ
          </div>
        )}

        {/* Photo area */}
        <div
          className="w-full h-[50%] flex items-center justify-center relative"
          style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)' }}
        >
          <span className="text-7xl">{restaurant.photoEmoji}</span>
          <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5">
            <span>📸</span>
            <span>{restaurant.influencer.handle}</span>
          </div>
        </div>

        {/* Info area */}
        <div className="px-4 py-3">
          <h3 className="text-base font-bold text-gray-900 mb-0.5">{restaurant.name}</h3>
          <p className="text-xs text-gray-500 mb-2">
            📍 {restaurant.distance} ・ {restaurant.priceRange}
          </p>
          <div className="flex gap-1.5 flex-wrap mb-2">
            <span className="bg-orange-50 text-orange-600 px-2.5 py-1 rounded-lg text-xs">
              {genreEmoji} {restaurant.genre}
            </span>
            {restaurant.scene.slice(0, 2).map((s) => (
              <span key={s} className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-xs">
                {s}
              </span>
            ))}
          </div>
          <button
            className="text-orange-500 text-xs font-bold"
            onClick={(e) => {
              e.stopPropagation();
              window.open(restaurant.videoUrl, '_blank');
            }}
          >
            ▶ {platformLabel}で動画を見る →
          </button>
        </div>
      </div>
    </div>
  );
}
