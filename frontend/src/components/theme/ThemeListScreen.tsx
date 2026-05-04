import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { findTheme } from '../../data/themes';
import * as api from '../../utils/api';
import { useGPS } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import { GENRES } from '../../data/mockRestaurants';
import { AuthModal } from '../auth/AuthModal';
import { FooterStrip } from '../feature/FeatureArticleScreen';
import { goBack, navigate } from '../../utils/navigate';

interface Restaurant extends SwipeRestaurant {
  description?: string;
  influencerHandle?: string;
  influencerUserId?: string;
  photoUrls?: string[];
  genres?: string[];
  urls?: string[];
}

interface Props {
  themeId: string;
}

interface SelectedArea {
  label: string;          // 表示名（例: 梅田）
  placeId?: string;
  lat?: number;
  lng?: number;
}

const POPULAR_AREAS = ['北新地', '心斎橋', '難波', '梅田', '福島'];

export function ThemeListScreen({ themeId }: Props) {
  const { user } = useAuth();
  const isAnonymous = !user;
  const { position } = useGPS();
  const theme = findTheme(themeId);

  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [feed, setFeed] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewRestaurant, setPreviewRestaurant] = useState<Restaurant | null>(null);

  // フィルター
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [areaInput, setAreaInput] = useState('');
  const [areaSuggestions, setAreaSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(10000);
  const [sortBy, setSortBy] = useState<'distance' | 'price-asc' | 'price-desc'>('distance');

  // Google Places
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const areaSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load Google Maps Places
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    if (window.google?.maps?.places) { setMapsLoaded(true); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { existing.addEventListener('load', () => setMapsLoaded(true)); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=ja`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (mapsLoaded && window.google?.maps?.places) {
      autocompleteService.current = new google.maps.places.AutocompleteService();
      if (!placesDiv.current) placesDiv.current = document.createElement('div');
      placesService.current = new google.maps.places.PlacesService(placesDiv.current);
    }
  }, [mapsLoaded]);

  // フィードを広めの半径で取得
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const lat = position?.lat ?? 34.7025;
    const lng = position?.lng ?? 135.4959;
    api.fetchRestaurantFeed(lat, lng, 20000, 100)
      .then((data: unknown) => {
        if (cancelled) return;
        setFeed(Array.isArray(data) ? (data as Restaurant[]) : []);
      })
      .catch(() => { if (!cancelled) setFeed([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [position?.lat, position?.lng]);

  // エリア検索（debounce）
  function handleAreaInputChange(v: string) {
    setAreaInput(v);
    if (areaSearchTimer.current) clearTimeout(areaSearchTimer.current);
    if (!v.trim()) {
      setAreaSuggestions([]);
      setShowAreaSuggestions(false);
      return;
    }
    areaSearchTimer.current = setTimeout(() => {
      if (!autocompleteService.current) return;
      autocompleteService.current.getPlacePredictions(
        {
          input: v,
          types: ['(regions)'],
          componentRestrictions: { country: 'jp' },
          language: 'ja',
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setAreaSuggestions(predictions.slice(0, 6));
            setShowAreaSuggestions(true);
          } else {
            setAreaSuggestions([]);
          }
        }
      );
    }, 250);
  }

  function selectArea(label: string, placeId?: string) {
    if (selectedAreas.some((a) => a.label === label)) return;
    if (!placeId) {
      setSelectedAreas((prev) => [...prev, { label }]);
      setAreaInput('');
      setShowAreaSuggestions(false);
      return;
    }
    placesService.current?.getDetails(
      { placeId, fields: ['geometry', 'name'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          setSelectedAreas((prev) => [...prev, {
            label,
            placeId,
            lat: place.geometry!.location!.lat(),
            lng: place.geometry!.location!.lng(),
          }]);
        } else {
          setSelectedAreas((prev) => [...prev, { label }]);
        }
        setAreaInput('');
        setShowAreaSuggestions(false);
      }
    );
  }

  function removeArea(label: string) {
    setSelectedAreas((prev) => prev.filter((a) => a.label !== label));
  }

  function toggleGenre(g: string) {
    setSelectedGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  function clearAll() {
    setSelectedAreas([]);
    setAreaInput('');
    setSelectedGenres([]);
    setPriceMin(0);
    setPriceMax(10000);
  }

  const filterCount =
    selectedAreas.length +
    selectedGenres.length +
    (priceMin > 0 || priceMax < 10000 ? 1 : 0);

  // フィルタリング + ソート
  const matched = useMemo(() => {
    if (!theme) return [];
    const kws = theme.keywords.map((k) => k.toLowerCase());
    let out = feed.filter((r) => {
      const text = [r.name, r.genre, r.description, ...(r.genres ?? []), ...(r.scene ?? [])]
        .join(' ').toLowerCase();
      return kws.some((kw) => text.includes(kw));
    });

    // エリアフィルタ：選択された各エリアに対して、住所文字列マッチ または 緯度経度近傍（半径 2km）
    if (selectedAreas.length > 0) {
      out = out.filter((r) => {
        return selectedAreas.some((area) => {
          const addrMatch = r.address?.toLowerCase().includes(area.label.toLowerCase());
          if (addrMatch) return true;
          if (area.lat != null && area.lng != null) {
            return distanceMetres(area.lat, area.lng, r.lat, r.lng) <= 2000;
          }
          return false;
        });
      });
    }

    // ジャンル
    if (selectedGenres.length > 0) {
      out = out.filter((r) => {
        const gs = [r.genre, ...(r.genres ?? [])].filter(Boolean) as string[];
        return gs.some((g) => selectedGenres.includes(g));
      });
    }

    // 価格
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
    if (sortBy === 'distance') out = [...out].sort((a, b) => distOf(a) - distOf(b));
    else if (sortBy === 'price-asc') out = [...out].sort((a, b) => priceOf(a) - priceOf(b));
    else if (sortBy === 'price-desc') out = [...out].sort((a, b) => priceOf(b) - priceOf(a));

    return out.slice(0, 60);
  }, [theme, feed, selectedAreas, selectedGenres, priceMin, priceMax, sortBy, position?.lat, position?.lng]);

  if (!theme) {
    return (
      <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
        <ThemeTopBar />
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

  return (
    <div className="h-svh overflow-y-auto bg-[var(--bg)] text-[var(--text-primary)]">
      <ThemeTopBar />

      {/* Hero */}
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

      {/* Body */}
      <div className="max-w-[1280px] xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">
        {/* Sidebar */}
        <aside>
          <div className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] p-5 shadow-[var(--shadow-sm)] lg:sticky lg:top-[68px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-extrabold tracking-[-0.01em]">絞り込み</h3>
              {filterCount > 0 && (
                <button onClick={clearAll} className="text-[12.5px] font-semibold text-[var(--accent-orange)]">クリア</button>
              )}
            </div>

            {/* 並び替え */}
            <div className="pb-4 mb-4 border-b border-[var(--border)]">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-2.5">並び替え</h4>
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
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] text-left transition-colors ${
                        active ? 'text-[var(--accent-orange)] font-bold' : 'text-[var(--text-primary)] hover:bg-[var(--bg-soft)]'
                      }`}
                      style={active ? { background: 'rgba(244,128,15,0.08)' } : undefined}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 grid place-items-center ${active ? 'border-[var(--accent-orange)]' : 'border-[var(--border-strong)]'}`}>
                        {active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-orange)' }} />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* エリア（検索） */}
            <div className="pb-4 mb-4 border-b border-[var(--border)]">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-2.5">エリア・駅</h4>
              <div className="relative mb-2">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </span>
                <input
                  type="text"
                  value={areaInput}
                  onChange={(e) => handleAreaInputChange(e.target.value)}
                  onFocus={() => areaSuggestions.length > 0 && setShowAreaSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 150)}
                  placeholder="例: 梅田、心斎橋駅"
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-8 pr-2 py-2 text-[13px] outline-none focus:border-[var(--accent-orange)] focus:bg-white"
                />
                {showAreaSuggestions && areaSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[var(--card-bg)] border border-[var(--border-strong)] rounded-lg shadow-[var(--shadow-lg)] max-h-[280px] overflow-auto">
                    {areaSuggestions.map((p) => (
                      <button
                        key={p.place_id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectArea(p.structured_formatting?.main_text || p.description, p.place_id);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--bg-soft)] text-[13px]"
                      >
                        <div className="font-semibold text-[var(--text-primary)] truncate">{p.structured_formatting?.main_text || p.description}</div>
                        {p.structured_formatting?.secondary_text && (
                          <div className="text-[11px] text-[var(--text-tertiary)] truncate">{p.structured_formatting.secondary_text}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedAreas.map((a) => (
                    <span
                      key={a.label}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold pl-2.5 pr-1 py-1 rounded-full text-white"
                      style={{ background: 'var(--accent-orange)' }}
                    >
                      {a.label}
                      <button
                        onClick={() => removeArea(a.label)}
                        className="w-4 h-4 rounded-full grid place-items-center hover:bg-white/20"
                        aria-label={`${a.label} を削除`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-tertiary)] mr-0.5">人気</span>
                {POPULAR_AREAS.filter((a) => !selectedAreas.some((s) => s.label === a)).slice(0, 5).map((a) => (
                  <button
                    key={a}
                    onClick={() => selectArea(a)}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-[var(--bg-soft)] text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* ジャンル */}
            <div className="pb-4 mb-4 border-b border-[var(--border)]">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-2.5">ジャンル</h4>
              <div className="flex flex-wrap gap-1.5">
                {GENRES.slice(0, 8).map((g) => {
                  const active = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={`text-[13px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        active ? 'text-white border-transparent' : 'text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-soft)]'
                      }`}
                      style={active ? { background: 'var(--accent-orange)' } : undefined}
                    >
                      {g}
                    </button>
                  );
                })}
                {GENRES.slice(8).map((g) => {
                  const active = selectedGenres.includes(g);
                  if (!active) return null;
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className="text-[13px] font-semibold px-3 py-1.5 rounded-full border-transparent text-white"
                      style={{ background: 'var(--accent-orange)' }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 価格帯 */}
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-2.5">価格帯</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[var(--text-secondary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMin || ''}
                    onChange={(e) => setPriceMin(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-6 pr-2 py-2 text-[13px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
                <span className="text-[var(--text-tertiary)] text-[12px]">〜</span>
                <div className="flex-1 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[var(--text-secondary)]">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceMax >= 10000 ? '' : priceMax || ''}
                    onChange={(e) => setPriceMax(parseInt(e.target.value) || 10000)}
                    placeholder="上限"
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-soft)] pl-6 pr-2 py-2 text-[13px] outline-none focus:border-[var(--accent-orange)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main>
          <div className="mb-5">
            <h2 className="text-[20px] font-extrabold tracking-[-0.015em] mb-0.5">「{theme.label}」のお店</h2>
            <p className="text-[12px] text-[var(--text-tertiary)]">
              {loading ? '検索中…' : `${matched.length} 件見つかりました`}
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] overflow-hidden">
                  <div className="aspect-[4/3] bg-[var(--bg-soft)] animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-[var(--bg-soft)] rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-[var(--bg-soft)] rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-[var(--bg-soft)] rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : matched.length === 0 ? (
            <div className="py-16 px-6 text-center bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)]">
              <div className="w-14 h-14 rounded-full mx-auto mb-3 grid place-items-center" style={{ background: 'var(--bg-soft)', color: 'var(--accent-orange)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <p className="text-[14px] font-bold mb-1.5">該当するお店が見つかりませんでした</p>
              <p className="text-[12px] text-[var(--text-secondary)] mb-5">フィルターを変えて試してみて</p>
              <button
                onClick={clearAll}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold text-white shadow-[var(--shadow-sm)] hover:-translate-y-0.5 transition-all"
                style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
              >
                絞り込みをクリア
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {matched.map((r) => (
                <ThemeCard
                  key={r.id}
                  restaurant={r}
                  userPosition={position}
                  onClick={() => setPreviewRestaurant(r)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <FooterStrip />

      {previewRestaurant && (
        <RestaurantDetailModal
          restaurant={previewRestaurant}
          userPosition={position}
          onClose={() => setPreviewRestaurant(null)}
          onRequireAuth={() => setAuthModal('signup')}
          isAnonymous={isAnonymous}
        />
      )}

      <AuthModal
        isOpen={authModal !== null}
        initialMode={authModal ?? 'signup'}
        onClose={() => setAuthModal(null)}
      />
    </div>
  );
}

/* ─── トップバー（戻る + ロゴのみ） ─── */
function ThemeTopBar() {
  return (
    <nav
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{ background: 'color-mix(in srgb, var(--header-bg) 88%, transparent)' }}
    >
      <div className="max-w-[1280px] xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 sm:gap-5">
        <button
          onClick={goBack}
          aria-label="戻る"
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border-strong)] bg-[var(--card-bg)] hover:bg-[var(--bg-soft)] transition-colors flex-shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-[20px] sm:text-[22px] font-extrabold tracking-[-0.02em]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          stoguru
        </button>
      </div>
    </nav>
  );
}

/* ─── カード（食べログ風 3 列グリッド + 写真左右タップナビ） ─── */
function ThemeCard({
  restaurant,
  userPosition,
  onClick,
}: {
  restaurant: Restaurant;
  userPosition: { lat: number; lng: number } | null;
  onClick: () => void;
}) {
  const photos = restaurant.photoUrls && restaurant.photoUrls.length > 0
    ? restaurant.photoUrls
    : [fallbackPhoto(restaurant.id)];
  const [photoIdx, setPhotoIdx] = useState(0);
  const distance = userPosition
    ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng))
    : restaurant.distance || '';
  const handle = restaurant.influencerHandle || restaurant.influencer?.handle || null;

  return (
    <div
      onClick={onClick}
      className="group bg-[var(--card-bg)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow)] hover:shadow-[var(--shadow-lg)] hover:border-[var(--border-strong)] hover:-translate-y-1 transition-all overflow-hidden cursor-pointer flex flex-col"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-[var(--bg-soft)]">
        <img
          src={photos[photoIdx]}
          alt={restaurant.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackPhoto(restaurant.id); }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />

        {/* 写真進行バー */}
        {photos.length > 1 && (
          <div className="absolute top-2 left-3 right-3 flex gap-[3px] z-[4] pointer-events-none">
            {photos.map((_, i) => (
              <div key={i} className={`flex-1 h-[3px] rounded-sm ${i === photoIdx ? 'bg-white' : 'bg-white/45'}`} />
            ))}
          </div>
        )}

        {/* 左右ナビゾーン */}
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }}
              className="absolute top-0 bottom-0 left-0 w-[35%] z-[3] cursor-pointer"
              aria-label="前の写真"
            />
            <button
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }}
              className="absolute top-0 bottom-0 right-0 w-[35%] z-[3] cursor-pointer"
              aria-label="次の写真"
            />
          </>
        )}

        {handle && (
          <span className="absolute bottom-3 left-3 z-[4] bg-black/60 backdrop-blur-md text-white text-[11.5px] font-semibold px-2.5 py-1 rounded-full">
            {handle.startsWith('@') ? handle : `@${handle}`}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <h3 className="text-[18px] font-extrabold tracking-[-0.015em] leading-[1.3] line-clamp-2">{restaurant.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-secondary)]">
          {distance && (
            <span className="inline-flex items-center gap-1 text-[var(--text-primary)] font-semibold">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {distance}
            </span>
          )}
          {restaurant.genre && (
            <span className="inline-flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}><path d="M5 14a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3a4 4 0 0 0-4-4l-7-3-3 3v7z"/></svg>
              {restaurant.genre}
            </span>
          )}
          {restaurant.priceRange && (
            <span className="text-[var(--text-primary)] font-bold tabular-nums">{restaurant.priceRange}</span>
          )}
        </div>
        {restaurant.description && (
          <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.55] line-clamp-2">{restaurant.description}</p>
        )}
        {restaurant.scene && restaurant.scene.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 mt-auto border-t border-[var(--border)]">
            {restaurant.scene.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 詳細モーダル ─── */
function RestaurantDetailModal({
  restaurant,
  userPosition,
  onClose,
  onRequireAuth,
  isAnonymous,
}: {
  restaurant: Restaurant;
  userPosition: { lat: number; lng: number } | null;
  onClose: () => void;
  onRequireAuth: () => void;
  isAnonymous: boolean;
}) {
  const photos = restaurant.photoUrls && restaurant.photoUrls.length > 0
    ? restaurant.photoUrls
    : [fallbackPhoto(restaurant.id)];
  const [photoIdx, setPhotoIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const distance = userPosition
    ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, restaurant.lat, restaurant.lng))
    : restaurant.distance || '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') setPhotoIdx((i) => (i + 1) % photos.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  function handleSave() {
    if (isAnonymous) { onRequireAuth(); return; }
    setSaved(true);
    setTimeout(onClose, 800);
  }

  const officialUrl = restaurant.urls?.[0] || restaurant.videoUrl || '';
  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card-bg)] rounded-[var(--radius-2xl)] max-w-[560px] w-full max-h-[92vh] overflow-hidden shadow-[var(--shadow-xl)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 写真エリア */}
        <div className="relative aspect-[4/3] bg-[var(--bg-soft)] flex-shrink-0 overflow-hidden">
          <img src={photos[photoIdx]} alt={restaurant.name} className="w-full h-full object-cover" />
          {photos.length > 1 && (
            <div className="absolute top-3 left-4 right-4 flex gap-1 z-[5]">
              {photos.map((_, i) => (
                <div key={i} className={`flex-1 h-[3px] rounded ${i === photoIdx ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          )}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIdx((photoIdx - 1 + photos.length) % photos.length)}
                className="absolute top-0 bottom-0 left-0 w-[35%] cursor-pointer z-[3]"
                aria-label="前の写真"
              />
              <button
                onClick={() => setPhotoIdx((photoIdx + 1) % photos.length)}
                className="absolute top-0 bottom-0 right-0 w-[35%] cursor-pointer z-[3]"
                aria-label="次の写真"
              />
            </>
          )}
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md grid place-items-center text-white hover:bg-black/70 transition-colors z-[10]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            className="absolute bottom-3.5 right-3.5 inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-bold text-[13px] text-white shadow-[var(--shadow-md)] z-[5]"
            style={{ background: saved ? 'var(--visited-green)' : 'var(--accent-orange)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            {saved ? '保存済み' : '保存する'}
          </button>
        </div>

        {/* 本文 */}
        <div className="px-6 py-5 overflow-y-auto">
          <h2 className="text-[22px] font-extrabold tracking-[-0.015em] mb-2 leading-tight">{restaurant.name}</h2>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-[var(--text-secondary)] mb-3">
            {restaurant.address && (
              <span className="inline-flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {restaurant.address}
              </span>
            )}
            {restaurant.genre && <span>{restaurant.genre}</span>}
            {restaurant.priceRange && <span className="text-[var(--text-primary)] font-bold tabular-nums">{restaurant.priceRange}</span>}
          </div>
          {restaurant.description && (
            <p className="text-[14px] text-[var(--text-secondary)] leading-[1.7] mb-4">{restaurant.description}</p>
          )}

          {/* 情報カード */}
          <div className="bg-[var(--bg-soft)] rounded-[var(--radius-md)] px-4 py-3.5 grid grid-cols-2 gap-3 mb-4">
            <InfoRow label="距離" value={distance || '—'} />
            <InfoRow label="ジャンル" value={restaurant.genre || '—'} />
            <InfoRow label="価格帯" value={restaurant.priceRange || '—'} />
            <InfoRow label="エリア" value={restaurant.address?.split(/[市区町村]/)[0]?.slice(-6) || '—'} />
          </div>

          {/* タグ */}
          {(restaurant.scene && restaurant.scene.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {restaurant.scene.map((s) => (
                <span key={s} className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full" style={{ color: 'var(--accent-orange)', background: 'rgba(244,128,15,0.1)' }}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* アクション */}
          <div className="flex gap-2.5 pt-3 border-t border-[var(--border)]">
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--card-bg)] text-[13px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
              マップで見る
            </a>
            {officialUrl && (
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[10px] text-[13px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--accent-orange-grad-1), var(--accent-orange-grad-2))' }}
              >
                公式サイトを開く
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{value}</span>
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
