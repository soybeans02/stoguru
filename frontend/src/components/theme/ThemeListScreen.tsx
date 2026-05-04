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
  const [sortBy, setSortBy] = useState<'distance' | 'price-asc' | 'price-desc'>('distance');

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
    // 並び替え
    const lat = position?.lat ?? 34.7025;
    const lng = position?.lng ?? 135.4959;
    const priceOf = (r: Restaurant) => parseInt((r.priceRange ?? '').replace(/[^0-9]/g, '')) || 999999;
    const distOf = (r: Restaurant) => distanceMetres(lat, lng, r.lat, r.lng);
    if (sortBy === 'distance') {
      out = [...out].sort((a, b) => distOf(a) - distOf(b));
    } else if (sortBy === 'price-asc') {
      out = [...out].sort((a, b) => priceOf(a) - priceOf(b));
    } else if (sortBy === 'price-desc') {
      out = [...out].sort((a, b) => priceOf(b) - priceOf(a));
    }
    return out.slice(0, 50);
  }, [theme, feed, selectedGenres, priceMin, priceMax, sortBy, position?.lat, position?.lng]);

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

      {/* Hero (compact) */}
      <header className="relative h-[160px] sm:h-[180px] lg:h-[200px] overflow-hidden">
        <img src={theme.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.3) 100%)' }} />
        <div className="absolute inset-0 max-w-[1280px] xl:max-w-[1440px] mx-auto px-5 sm:px-6 lg:px-8 flex items-center text-white">
          <div className="max-w-[640px]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] opacity-80 mb-1.5">テーマ</div>
            <h1 className="text-[26px] sm:text-[30px] lg:text-[36px] font-extrabold tracking-[-0.02em] leading-tight mb-1.5">
              {theme.label}
            </h1>
            <p className="text-[12.5px] sm:text-[14px] opacity-90 leading-relaxed line-clamp-2">{theme.description}</p>
          </div>
        </div>
      </header>

      {/* Body: sidebar + list */}
      <div className="max-w-[1280px] xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-8">
        {/* Sidebar (filter) */}
        <aside>
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] p-4 shadow-[var(--shadow-sm)] lg:sticky lg:top-[68px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-extrabold tracking-[-0.01em]">絞り込み</h3>
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
            <div className="mb-4 pb-4 border-b border-[var(--border)]">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)] mb-2">ジャンル</h4>
              <div className="flex flex-wrap gap-1.5">
                {visibleGenres.map((g) => {
                  const active = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
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
                  className="mt-2 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-orange)]"
                >
                  {showAllGenres ? '閉じる' : `+ もっと見る (${GENRES.length - VISIBLE_GENRE_COUNT})`}
                </button>
              )}
            </div>

            {/* Price */}
            <div className="mb-4 pb-4 border-b border-[var(--border)]">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)] mb-2">価格帯</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11.5px] text-[var(--text-tertiary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMin || ''}
                    onChange={(e) => setPriceMin(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-5 pr-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
                <span className="text-[var(--text-tertiary)] text-[11px]">〜</span>
                <div className="flex-1 relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11.5px] text-[var(--text-tertiary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMax >= 10000 ? '' : priceMax || ''}
                    onChange={(e) => setPriceMax(parseInt(e.target.value) || 10000)}
                    placeholder="上限"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-5 pr-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
              </div>
            </div>

            {/* Sort */}
            <div>
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)] mb-2">並び替え</h4>
              <div className="flex flex-col gap-1">
                {([
                  { id: 'distance', label: '距離が近い順' },
                  { id: 'price-asc', label: '価格が安い順' },
                  { id: 'price-desc', label: '価格が高い順' },
                ] as const).map((opt) => {
                  const active = sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSortBy(opt.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                        active
                          ? 'text-[var(--accent-orange)] font-semibold bg-[var(--bg-soft)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${active ? 'border-[var(--accent-orange)]' : 'border-[var(--border-strong)]'}`}>
                        {active && <span className="block w-1.5 h-1.5 rounded-full m-auto mt-[3px]" style={{ background: 'var(--accent-orange)' }} />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* List */}
        <main>
          <div className="flex items-end justify-between mb-4 pb-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-[16px] sm:text-[18px] font-extrabold tracking-[-0.015em]">「{theme.label}」のお店</h2>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                {loading ? '検索中…' : `${matched.length} 件見つかりました`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] overflow-hidden grid grid-cols-[140px_1fr] sm:grid-cols-[200px_1fr] h-[140px] sm:h-[160px]">
                  <div className="bg-[var(--bg-soft)] animate-pulse" />
                  <div className="p-4 sm:p-5 flex flex-col gap-2">
                    <div className="h-4 bg-[var(--bg-soft)] rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-[var(--bg-soft)] rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-[var(--bg-soft)] rounded animate-pulse w-3/4 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : matched.length === 0 ? (
            <div className="py-16 px-6 text-center bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-3 grid place-items-center"
                style={{ background: 'var(--bg-soft)', color: 'var(--accent-orange)' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
              </div>
              <p className="text-[14px] font-bold mb-1.5">該当するお店が見つかりませんでした</p>
              <p className="text-[12px] text-[var(--text-secondary)] mb-5">フィルターを変えて試してみて</p>
              <button
                onClick={() => { setSelectedGenres([]); setPriceMin(0); setPriceMax(10000); }}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 transition-all"
                style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
              >
                絞り込みをクリア
              </button>
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
    <div className="group bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--border-strong)] transition-all overflow-hidden grid grid-cols-[120px_1fr] sm:grid-cols-[200px_1fr] cursor-pointer">
      <div className="h-[120px] sm:h-[160px] bg-[var(--bg-soft)] overflow-hidden">
        <img
          src={photo}
          alt={restaurant.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id); }}
        />
      </div>
      <div className="p-3.5 sm:p-4 flex flex-col min-w-0">
        <h3 className="text-[15px] sm:text-[16px] font-bold tracking-[-0.01em] mb-1 truncate">{restaurant.name}</h3>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-[11.5px] text-[var(--text-secondary)] mb-1.5">
          {distance && <span className="font-medium">{distance}</span>}
          {distance && restaurant.genre && <span className="opacity-40">·</span>}
          {restaurant.genre && <span>{restaurant.genre}</span>}
          {restaurant.priceRange && <span className="opacity-40">·</span>}
          {restaurant.priceRange && <span className="font-semibold tabular-nums text-[var(--text-primary)]">{restaurant.priceRange}</span>}
        </div>
        {restaurant.description && (
          <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2 hidden sm:block">
            {restaurant.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-auto">
          {(restaurant.genres ?? []).slice(0, 3).map((g, i) => (
            <span
              key={i}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
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
