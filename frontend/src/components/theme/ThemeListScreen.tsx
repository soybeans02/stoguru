import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { findTheme } from '../../data/themes';
import * as api from '../../utils/api';
import { useGPS } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { GENRES } from '../../data/mockRestaurants';
import { AuthModal } from '../auth/AuthModal';
import { ArticleTopBar, FooterStrip } from '../feature/FeatureArticleScreen';
import { navigate } from '../../utils/navigate';

interface Restaurant extends SwipeRestaurant {
  description?: string;
  influencerHandle?: string;
  influencerUserId?: string;
  photoUrls?: string[];
  genres?: string[];
}

interface Props {
  themeId: string;
}

const VISIBLE_GENRE_COUNT = 8;

export function ThemeListScreen({ themeId }: Props) {
  const { user } = useAuth();
  const isAnonymous = !user;
  const { position } = useGPS();
  const theme = findTheme(themeId);

  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [feed, setFeed] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  // 追加フィルター
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(10000);
  const [showAllGenres, setShowAllGenres] = useState(false);

  // 広めのエリアで feed を取得（テーマ一覧は近所だけだと寂しいので 20km）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const lat = position?.lat ?? 34.7025;
    const lng = position?.lng ?? 135.4959;
    api.fetchRestaurantFeed(lat, lng, 20000, 100)
      .then((data: unknown) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setFeed(arr as Restaurant[]);
      })
      .catch(() => { if (!cancelled) setFeed([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [position?.lat, position?.lng]);

  // テーマキーワード + サイドバーフィルターで絞る
  const matched = useMemo(() => {
    if (!theme) return [];
    const kws = theme.keywords.map((k) => k.toLowerCase());
    let out = feed.filter((r) => {
      const text = [
        r.name,
        r.genre,
        r.description,
        ...(r.genres ?? []),
        ...(r.scene ?? []),
      ].join(' ').toLowerCase();
      return kws.some((kw) => text.includes(kw));
    });
    if (selectedGenres.length > 0) {
      out = out.filter((r) => {
        const gs = [r.genre, ...(r.genres ?? [])].filter(Boolean) as string[];
        return gs.some((g) => selectedGenres.includes(g));
      });
    }
    if (priceMin > 0 || priceMax < 10000) {
      out = out.filter((r) => {
        const price = parseInt((r.priceRange ?? '').replace(/[^0-9]/g, '')) || 0;
        return price >= priceMin && price <= priceMax;
      });
    }
    return out.slice(0, 50);
  }, [theme, feed, selectedGenres, priceMin, priceMax]);

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  };

  if (!theme) {
    return (
      <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
        <ArticleTopBar
          isAnonymous={isAnonymous}
          onSignUp={() => setAuthModal('signup')}
          onLogIn={() => setAuthModal('login')}
        />
        <div className="flex-1 grid place-items-center px-6 py-20 text-center">
          <div>
            <p className="text-[18px] font-bold mb-2">テーマが見つかりません</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent-orange)' }}
            >
              ホームへ戻る
            </button>
          </div>
        </div>
        <AuthModal isOpen={authModal !== null} initialMode={authModal ?? 'signup'} onClose={() => setAuthModal(null)} />
      </div>
    );
  }

  const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, VISIBLE_GENRE_COUNT);
  const filterCount = selectedGenres.length + (priceMin > 0 || priceMax < 10000 ? 1 : 0);

  return (
    <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)]">
      <ArticleTopBar
        isAnonymous={isAnonymous}
        onSignUp={() => setAuthModal('signup')}
        onLogIn={() => setAuthModal('login')}
      />

      {/* Hero */}
      <header className="relative h-[180px] sm:h-[220px] lg:h-[260px] overflow-hidden">
        <img src={theme.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.85) 100%)' }} />
        <div className="absolute left-0 right-0 bottom-0 max-w-[1200px] mx-auto px-5 sm:px-6 lg:px-8 pb-8 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-90 mb-2">テーマ</div>
          <h1 className="text-[28px] sm:text-[34px] lg:text-[42px] font-extrabold tracking-[-0.02em] leading-tight mb-2">
            {theme.label}
          </h1>
          <p className="text-[13px] sm:text-[15px] opacity-90 max-w-[560px] leading-relaxed">{theme.description}</p>
        </div>
      </header>

      {/* Body: sidebar + list */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">
        {/* Sidebar (filter) */}
        <aside className="space-y-5">
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] p-5 shadow-[var(--shadow-sm)] sticky top-[72px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-extrabold tracking-[-0.01em]">絞り込み</h3>
              {filterCount > 0 && (
                <button
                  onClick={() => { setSelectedGenres([]); setPriceMin(0); setPriceMax(10000); }}
                  className="text-[11px] font-semibold text-[var(--accent-orange)]"
                >
                  クリア
                </button>
              )}
            </div>

            {/* Genre */}
            <div className="mb-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)] mb-2.5">ジャンル</h4>
              <div className="flex flex-wrap gap-1.5">
                {visibleGenres.map((g) => {
                  const active = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        active
                          ? 'text-white border-transparent'
                          : 'text-[var(--text-secondary)] border-[var(--border-strong)] hover:bg-[var(--bg-soft)]'
                      }`}
                      style={active ? { background: 'var(--accent-orange)' } : undefined}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
              {GENRES.length > VISIBLE_GENRE_COUNT && (
                <button
                  onClick={() => setShowAllGenres((v) => !v)}
                  className="mt-2.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-orange)]"
                >
                  {showAllGenres ? '閉じる' : `+ もっと見る (${GENRES.length - VISIBLE_GENRE_COUNT})`}
                </button>
              )}
            </div>

            {/* Price */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)] mb-2.5">価格帯</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-tertiary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMin || ''}
                    onChange={(e) => setPriceMin(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-6 pr-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
                <span className="text-[var(--text-tertiary)]">〜</span>
                <div className="flex-1 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-tertiary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMax >= 10000 ? '' : priceMax || ''}
                    onChange={(e) => setPriceMax(parseInt(e.target.value) || 10000)}
                    placeholder="上限"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-6 pr-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* List */}
        <main>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[18px] sm:text-[20px] font-extrabold tracking-[-0.015em]">「{theme.label}」のお店</h2>
              <p className="text-[12.5px] text-[var(--text-tertiary)] mt-0.5">{loading ? '検索中…' : `${matched.length} 件`}</p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] text-sm">読み込み中…</div>
          ) : matched.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] text-sm bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
              条件に合うお店が見つかりませんでした。フィルターを調整してみて。
            </div>
          ) : (
            <div className="space-y-3">
              {matched.map((r) => (
                <ThemeRestaurantRow
                  key={r.id}
                  restaurant={r}
                  userPosition={position}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <FooterStrip />

      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}

/* 食べログ風 横長カード */
function ThemeRestaurantRow({
  restaurant,
  userPosition,
}: {
  restaurant: Restaurant;
  userPosition: { lat: number; lng: number } | null;
}) {
  const photo = (restaurant.photoUrls && restaurant.photoUrls[0]) || fallbackPhoto(restaurant.id);
  const distance = userPosition
    ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng))
    : restaurant.distance || '';

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all overflow-hidden grid grid-cols-1 sm:grid-cols-[200px_1fr]">
      <div className="aspect-video sm:aspect-auto sm:h-full bg-[var(--bg-soft)] overflow-hidden">
        <img
          src={photo}
          alt={restaurant.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id); }}
        />
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="text-[16px] sm:text-[17px] font-bold tracking-[-0.01em] mb-1.5">{restaurant.name}</h3>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-[var(--text-secondary)] mb-2">
          {distance && <span>{distance}</span>}
          {distance && restaurant.genre && <span className="opacity-50">·</span>}
          {restaurant.genre && <span>{restaurant.genre}</span>}
          {restaurant.priceRange && <span className="opacity-50">·</span>}
          {restaurant.priceRange && <span>{restaurant.priceRange}</span>}
        </div>
        {restaurant.description && (
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2">
            {restaurant.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(restaurant.genres ?? []).slice(0, 3).map((g, i) => (
            <span
              key={i}
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function fallbackPhoto(id: string): string {
  const pool = [
    'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}
