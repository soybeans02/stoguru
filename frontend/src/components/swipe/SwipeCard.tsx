import { useState, useRef, useCallback, useEffect } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { GENRE_EMOJI } from '../../data/mockRestaurants';

interface Props {
  restaurant: SwipeRestaurant;
  onSwipeComplete: (direction: 'left' | 'right') => void;
  active: boolean;
  flyOut?: 'left' | 'right' | null; // ボタン押下時の飛ばし指示
}

export function SwipeCard({ restaurant, onSwipeComplete, active, flyOut }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const SWIPE_THRESHOLD = 80;

  // ボタンからの飛ばし指示
  useEffect(() => {
    if (flyOut && !exiting) {
      setExiting(flyOut);
      setTimeout(() => onSwipeComplete(flyOut), 300);
    }
  }, [flyOut, exiting, onSwipeComplete]);

  // カードが切り替わったらリセット
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    setExiting(null);
  }, [restaurant.id]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!active || exiting) return;
    setDragging(true);
    startPos.current = { x: clientX, y: clientY };
  }, [active, exiting]);

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
      const dir = offset.x > 0 ? 'right' : 'left';
      setExiting(dir);
      setTimeout(() => onSwipeComplete(dir), 300);
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }, [dragging, offset.x, onSwipeComplete]);

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handleEnd();

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);

  // Global mouse/touch up
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

  // Transform計算
  let transform: string;
  let opacity = 1;
  let transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

  if (exiting) {
    // 飛ばしアニメーション
    transform = exiting === 'right'
      ? 'translateX(120%) rotate(15deg)'
      : 'translateX(-120%) rotate(-15deg)';
    opacity = 0;
  } else if (active) {
    transform = `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.08}deg)`;
    opacity = Math.max(0.3, 1 - Math.abs(offset.x) / 400);
    if (dragging) transition = 'none';
  } else {
    transform = 'scale(0.95) translateY(6px)';
    opacity = 0.6;
  }

  const platformLabel = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
  }[restaurant.influencer.platform];

  const genreEmoji = GENRE_EMOJI[restaurant.genre] ?? '🍽️';

  return (
    <div
      className="absolute inset-0 select-none"
      style={{
        transform,
        transition,
        opacity,
        zIndex: active ? 10 : 5,
        cursor: active && !exiting ? 'grab' : 'default',
        touchAction: 'none',
        willChange: 'transform, opacity',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="w-full h-full bg-white rounded-2xl overflow-hidden shadow-xl">
        {/* Swipe overlay labels */}
        {offset.x > 30 && !exiting && (
          <div className="absolute top-5 left-4 z-20 border-3 border-green-500 text-green-500 bg-white/90 px-4 py-1 rounded-lg text-xl font-extrabold -rotate-12">
            ○ 気になる
          </div>
        )}
        {offset.x < -30 && !exiting && (
          <div className="absolute top-5 right-4 z-20 border-3 border-red-500 text-red-500 bg-white/90 px-4 py-1 rounded-lg text-xl font-extrabold rotate-12">
            ✕ スキップ
          </div>
        )}
        {exiting === 'right' && (
          <div className="absolute top-5 left-4 z-20 border-3 border-green-500 text-green-500 bg-white/90 px-4 py-1 rounded-lg text-xl font-extrabold -rotate-12">
            ○ 気になる
          </div>
        )}
        {exiting === 'left' && (
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
