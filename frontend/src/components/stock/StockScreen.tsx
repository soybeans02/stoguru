import { useState, useMemo } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { RestaurantPreviewModal, type FeedRestaurant } from '../home/DiscoveryHome';
import './stock-page.css';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface StockedRestaurant extends SwipeRestaurant {
  visited: boolean;
  stockedAt: string;
  visitedAt?: string;
  pinned?: boolean;
}

type Filter = 'all' | 'unvisited' | 'visited';
type SortMode = 'added' | 'distance';

interface Props {
  stocks: StockedRestaurant[];
  onMarkVisited: (id: string) => void;
  onUnmarkVisited: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShowOnMap: (lat: number, lng: number, restaurant?: StockedRestaurant) => void;
  userPosition: GPSPosition | null;
}


export function StockScreen({ stocks, onMarkVisited, onUnmarkVisited, onRemoveStock, onTogglePin, onShowOnMap, userPosition }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreOpen, setGenreOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  const [openId, setOpenId] = useState<string | null>(null);
  // Claude Design: grid / list view 切り替え
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // カードタップで開くプレビューモーダル（home の RestaurantPreviewModal を流用）
  const [preview, setPreview] = useState<FeedRestaurant | null>(null);
  const visitedCount = stocks.filter((s) => s.visited).length;
  const todoCount = stocks.length - visitedCount;
  const completionRate = stocks.length > 0 ? Math.round((visitedCount / stocks.length) * 100) : 0;

  // ストック内のジャンル一覧
  const genres = useMemo(() => {
    const set = new Set(stocks.map((s) => s.genre).filter(Boolean));
    return [...set].sort();
  }, [stocks]);

  const filtered = useMemo(() => stocks
    .filter((s) => {
      if (filter === 'unvisited') return !s.visited;
      if (filter === 'visited') return s.visited;
      return true;
    })
    .filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q);
      }
      return true;
    })
    .filter((s) => !selectedGenre || s.genre === selectedGenre)
    .sort((a, b) => {
      // ピン留め優先
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'distance' && userPosition) {
        const distA = distanceMetres(userPosition.lat, userPosition.lng, a.lat, a.lng);
        const distB = distanceMetres(userPosition.lat, userPosition.lng, b.lat, b.lng);
        return distA - distB;
      }
      // 追加順（デフォルト）: stockedAtの降順（新しい順）
      return new Date(b.stockedAt).getTime() - new Date(a.stockedAt).getTime();
    }), [stocks, filter, search, selectedGenre, sortMode, userPosition]);

  // 投稿者ハンドル → ソースタイプ判定（IG/TT/YT）
  const sourceTypeOf = (s: StockedRestaurant): 'tt' | 'ig' | 'yt' => {
    const platform = (s.influencer?.platform ?? '').toLowerCase();
    if (platform === 'tiktok') return 'tt';
    if (platform === 'youtube') return 'yt';
    if (platform === 'instagram') return 'ig';
    // フォールバック：URL から推測
    const url = (s.videoUrl ?? '').toLowerCase();
    if (url.includes('tiktok')) return 'tt';
    if (url.includes('youtube') || url.includes('youtu.be')) return 'yt';
    return 'ig';
  };
  // openId / SwipeableCard は使わなくなるので suppress 警告
  void openId; void setOpenId; void genreOpen; void setGenreOpen;

  return (
    <div className="flex-1 overflow-y-auto overscroll-none stg-main">
      {/* ─── 一番上の全幅検索窓（design ではこれが最上段）─── */}
      <div className="page-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          placeholder="店名・ジャンル・エリアで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="検索クリア"
            className="page-search__clear"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      <header className="page-head">
        <div>
          <h1>保存</h1>
          <div className="page-head__sub">
            <span><b>{stocks.length}</b>件</span>
            <span>うち <b>{visitedCount}</b>件 行った</span>
            <span>達成率 <b>{completionRate}%</b></span>
          </div>
        </div>
        <div className="page-head__actions"></div>
      </header>

      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card__icon ic-saved">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>
          </div>
          <div><div className="stat-card__num">{stocks.length}</div><div className="stat-card__lbl">保存数</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-visited">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div><div className="stat-card__num">{visitedCount}</div><div className="stat-card__lbl">行った</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-todo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div><div className="stat-card__num">{todoCount}</div><div className="stat-card__lbl">まだ行ってない</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-rate">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.4 14 6.7l5.8.8-4.2 4 1 5.7-5.1-2.7L6.4 17.3l1-5.7-4.2-4 5.8-.8z"/></svg>
          </div>
          <div><div className="stat-card__num">{completionRate}%</div><div className="stat-card__lbl">達成率</div></div>
        </div>
      </div>

      <div className="toolbar">
        {/* 検索窓は最上段の .page-search に移動済み（design 準拠） */}
        <div className="tab-pills">
          <button className={`tab-pill ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>すべて<span className="tab-pill__count">{stocks.length}</span></button>
          <button className={`tab-pill ${filter === 'unvisited' ? 'is-active' : ''}`} onClick={() => setFilter('unvisited')}>まだ<span className="tab-pill__count">{todoCount}</span></button>
          <button className={`tab-pill ${filter === 'visited' ? 'is-active' : ''}`} onClick={() => setFilter('visited')}>行った<span className="tab-pill__count">{visitedCount}</span></button>
        </div>
        <button
          className={`chip-btn ${selectedGenre ? 'is-active' : ''}`}
          onClick={() => {
            // ジャンルフィルタ：循環選択（クリックで次のジャンル / 全部一周したら null）
            if (genres.length === 0) return;
            const idx = selectedGenre ? genres.indexOf(selectedGenre) : -1;
            const next = idx + 1 < genres.length ? genres[idx + 1] : null;
            setSelectedGenre(next);
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/></svg>
          {selectedGenre ?? '絞り込み'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <button className="chip-btn" onClick={() => setSortMode(sortMode === 'added' ? 'distance' : 'added')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
          {sortMode === 'added' ? '追加順' : '距離順'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="grid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} aria-label="list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
          </button>
        </div>
      </div>

      {selectedGenre && (
        <div className="active-filters">
          <span className="active-filter">
            {selectedGenre}
            <button onClick={() => setSelectedGenre(null)} aria-label="clear">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </span>
          <button className="clear-all" onClick={() => { setSelectedGenre(null); setSearch(''); }}>すべてクリア</button>
        </div>
      )}

      {stocks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--stg-gray-600)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--stg-gray-900)', marginBottom: 6 }}>まだ保存がないよ</div>
          <div style={{ fontSize: 13 }}>ホームで気になる店をスワイプしよう</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--stg-gray-600)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--stg-gray-900)', marginBottom: 6 }}>該当するお店がありません</div>
          <div style={{ fontSize: 13 }}>条件を変えて、もう一度試してみてください</div>
        </div>
      ) : view === 'grid' ? (
        <div className="stock-grid">
          {filtered.map((s) => {
            const photo = s.photoUrls?.[0] ?? '';
            const dist = userPosition && s.lat && s.lng
              ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng))
              : '';
            const src = sourceTypeOf(s);
            const handle = s.influencer?.handle ?? '';
            const chips = [s.genre, ...(s.scene ?? [])].filter(Boolean).slice(0, 3) as string[];
            return (
              <div
                key={s.id}
                className={`stock-card ${s.visited ? 'is-visited' : ''}`}
                onClick={() => setPreview(s as unknown as FeedRestaurant)}
              >
                <div className="stock-card__photo">
                  {photo ? <img loading="lazy" src={photo} alt={s.name} /> : null}
                  {s.pinned && (
                    <button className="stock-card__pin" onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); }} aria-label="ピン解除">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.5 7 13 7 13s7-7.5 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>
                    </button>
                  )}
                  <div className="stock-card__date">{formatDate(s.stockedAt)}</div>
                  {s.visited && (
                    <div className="stock-card__visited-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      行った
                    </div>
                  )}
                  <button
                    className="stock-card__remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`「${s.name}」を保存から削除する？`)) onRemoveStock(s.id);
                    }}
                    aria-label="削除"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="stock-card__body">
                  <h3 className="stock-card__title">{s.name}</h3>
                  <div className="stock-card__meta">
                    {dist && <><span>{dist}</span><span className="stock-card__meta-dot"></span></>}
                    {s.genre && <><span>{s.genre}</span></>}
                    {s.priceRange && <><span className="stock-card__meta-dot"></span><span>{s.priceRange}</span></>}
                  </div>
                  {handle && (
                    <div className="stock-card__source">
                      <span className={`stock-card__source-dot ${src}`}>{src.toUpperCase()}</span>
                      {handle.startsWith('@') ? handle : `@${handle}`} で発見
                    </div>
                  )}
                  {chips.length > 0 && (
                    <div className="stock-card__chips">
                      {chips.map((c, i) => (
                        <span key={i} className="stock-card__chip">{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="stock-card__actions">
                    <button
                      className="stock-card__action"
                      onClick={(e) => { e.stopPropagation(); onShowOnMap(s.lat, s.lng, s); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></svg>
                      マップ
                    </button>
                    {s.videoUrl ? (
                      <a
                        className="stock-card__action"
                        href={s.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: 'none' }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>
                        動画
                      </a>
                    ) : (
                      <button className="stock-card__action" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>
                        動画
                      </button>
                    )}
                    {s.visited ? (
                      <button
                        className="stock-card__action stock-card__action--done"
                        onClick={(e) => { e.stopPropagation(); onUnmarkVisited(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        行った
                      </button>
                    ) : (
                      <button
                        className="stock-card__action stock-card__action--primary"
                        onClick={(e) => { e.stopPropagation(); onMarkVisited(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        行った
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="stock-list">
          {filtered.map((s) => {
            const photo = s.photoUrls?.[0] ?? '';
            const dist = userPosition && s.lat && s.lng
              ? formatDistance(distanceMetres(userPosition.lat, userPosition.lng, s.lat, s.lng))
              : '';
            const src = sourceTypeOf(s);
            return (
              <div
                key={s.id}
                className={`stock-row ${s.visited ? 'is-visited' : ''}`}
                onClick={() => setPreview(s as unknown as FeedRestaurant)}
              >
                <div className="stock-row__photo">
                  {photo && <img loading="lazy" src={photo} alt={s.name} />}
                </div>
                <div className="stock-row__body">
                  <div className="stock-row__title">{s.name}</div>
                  <div className="stock-row__meta">
                    <span className={`stock-card__source-dot ${src}`}>{src.toUpperCase()}</span>
                    {s.address && <span className="stock-row__meta-address">{s.address}</span>}
                    {dist && <><span className="stock-card__meta-dot"></span><span>{dist}</span></>}
                    {s.genre && <><span className="stock-card__meta-dot"></span><span>{s.genre}</span></>}
                    {s.priceRange && <><span className="stock-card__meta-dot"></span><span>{s.priceRange}</span></>}
                  </div>
                </div>
                <div className="stock-row__date">{formatDate(s.stockedAt)}</div>
                <div className="stock-row__actions">
                  <button
                    className="stock-card__action"
                    style={{ flex: 'none', padding: '7px 10px' }}
                    onClick={(e) => { e.stopPropagation(); onShowOnMap(s.lat, s.lng, s); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></svg>
                    マップ
                  </button>
                  {s.visited ? (
                    <button
                      className="stock-card__action stock-card__action--done"
                      style={{ flex: 'none', padding: '7px 10px' }}
                      onClick={(e) => { e.stopPropagation(); onUnmarkVisited(s.id); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      行った
                    </button>
                  ) : (
                    <button
                      className="stock-card__action stock-card__action--primary"
                      style={{ flex: 'none', padding: '7px 10px' }}
                      onClick={(e) => { e.stopPropagation(); onMarkVisited(s.id); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      行った
                    </button>
                  )}
                </div>
                <button
                  className="stock-card__action"
                  style={{ flex: 'none', padding: '7px 10px', border: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`「${s.name}」を保存から削除する？`)) onRemoveStock(s.id);
                  }}
                  aria-label="削除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* カード/行 タップで開くプレビューモーダル。
          home の RestaurantPreviewModal と同一 UI。保存ページ専用に
          「マップで見る」ボタンを追加（onShowOnMap 経由）。 */}
      {preview && (
        <RestaurantPreviewModal
          restaurant={preview}
          userPosition={userPosition}
          bookmarked={true /* 保存ページなので必ず保存済み */}
          onBookmark={() => {
            // 保存ページから 保存済み を押した = 解除
            if (window.confirm(`「${preview.name}」を保存から削除する？`)) {
              onRemoveStock(preview.id);
              setPreview(null);
            }
          }}
          onClose={() => setPreview(null)}
          onShowOnMap={() => onShowOnMap(preview.lat, preview.lng, preview as unknown as StockedRestaurant)}
        />
      )}
    </div>
  );
}
