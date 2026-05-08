import { useState, useMemo } from 'react';
import type { SwipeRestaurant } from '../../data/mockRestaurants';
import type { GPSPosition } from '../../hooks/useGPS';
import { distanceMetres, formatDistance } from '../../utils/distance';
import { matchesAnyPrefecture } from '../../utils/prefecture';
import { priceRangeMatches } from '../../utils/price';
import { useTranslation } from '../../context/LanguageContext';
import { localizeGenre, localizeScene, localizePrefecture, localizeTag, localizeProperNoun } from '../../utils/labelI18n';
import { RestaurantPreviewModal, type FeedRestaurant } from '../home/DiscoveryHome';
import { FilterOverlay } from '../swipe/FilterOverlay';
import { getTranslation, STORAGE_KEY, type Language } from '../../i18n';
import './stock-page.css';

// utility 関数の中で言語を解決するための localStorage 直読みヘルパー。
function readLang(): Language {
  if (typeof window === 'undefined') return 'ja';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ja';
}

/** 保存日を「今日 / 昨日 / 3日前 / 2週間前 / 5ヶ月前 / 1年前」のような
 *  相対時刻に整形する。旧 `5/7` だけだと初見で何の数字か分からなかったので
 *  ぱっと意味の取れるラベルに置き換える。 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  const lang = readLang();
  if (diffDays <= 0) return getTranslation(lang, 'stock.dateToday');
  if (diffDays === 1) return getTranslation(lang, 'stock.dateYesterday');
  if (diffDays < 7) return getTranslation(lang, 'stock.dateDaysAgo').replace('{n}', String(diffDays));
  if (diffDays < 30) return getTranslation(lang, 'stock.dateWeeksAgo').replace('{n}', String(Math.floor(diffDays / 7)));
  if (diffDays < 365) return getTranslation(lang, 'stock.dateMonthsAgo').replace('{n}', String(Math.floor(diffDays / 30)));
  return getTranslation(lang, 'stock.dateYearsAgo').replace('{n}', String(Math.floor(diffDays / 365)));
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
  const { t, language } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  // 旧: 単一ジャンル循環選択 → 新: マップ/スワイプ画面と同じ FilterOverlay
  // を開いて、複数ジャンル + シーン + エリア + 価格帯を絞り込む。
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(10000);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  const [openId, setOpenId] = useState<string | null>(null);
  // Claude Design: grid / list view 切り替え
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // カードタップで開くプレビューモーダル（home の RestaurantPreviewModal を流用）
  const [preview, setPreview] = useState<FeedRestaurant | null>(null);
  const visitedCount = stocks.filter((s) => s.visited).length;
  const todoCount = stocks.length - visitedCount;
  const completionRate = stocks.length > 0 ? Math.round((visitedCount / stocks.length) * 100) : 0;

  // 絞り込み条件のアクティブ件数（バッジに使う）
  const activeFilterCount =
    selectedScenes.length +
    selectedGenres.length +
    selectedAreas.length +
    (priceMin > 0 || priceMax < 10000 ? 1 : 0);

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
    // シーン (OR 一致：いずれかのシーンが含まれていれば通す)
    .filter((s) => {
      if (selectedScenes.length === 0) return true;
      return s.scene?.some((sc) => selectedScenes.includes(sc)) ?? false;
    })
    // ジャンル (OR 一致)
    .filter((s) => {
      if (selectedGenres.length === 0) return true;
      return selectedGenres.includes(s.genre);
    })
    // エリア — 住所文字列から都道府県を抽出して厳密一致。
    // 旧 startsWith は「〒530-... 大阪府...」のような postal-code prefix で
    // 外れていたので matchesAnyPrefecture (include ベース) に置き換え。
    .filter((s) => matchesAnyPrefecture(s.address, selectedAreas))
    // 価格帯 — 店レンジとフィルタレンジの「重なり」で判定。
    // 旧版は priceRange の全数字を結合して 1 整数化していたため
    // "¥1,000〜¥2,000" が 10,002,000 円扱いで全部弾かれる事故があった。
    .filter((s) => priceRangeMatches(s.priceRange, priceMin, priceMax))
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
    }), [stocks, filter, search, selectedScenes, selectedGenres, selectedAreas, priceMin, priceMax, sortMode, userPosition]);

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
  void openId; void setOpenId;

  return (
    <div className="flex-1 overflow-y-auto overscroll-none stg-main">
      {/* ─── 一番上の全幅検索窓（design ではこれが最上段）─── */}
      <div className="page-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          placeholder={t('stock.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('common.clear')}
            className="page-search__clear"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      <header className="page-head">
        <div>
          <h1>{t('stock.title')}</h1>
          <div className="page-head__sub">
            <span><b>{stocks.length}</b></span>
            <span>{t('stock.summaryVisitedTemplate').replace('{n}', String(visitedCount))}</span>
            <span>{completionRate}%</span>
          </div>
        </div>
        <div className="page-head__actions"></div>
      </header>

      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card__icon ic-saved">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>
          </div>
          <div><div className="stat-card__num">{stocks.length}</div><div className="stat-card__lbl">{t('account.saved')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-visited">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div><div className="stat-card__num">{visitedCount}</div><div className="stat-card__lbl">{t('stock.visited')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-todo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div><div className="stat-card__num">{todoCount}</div><div className="stat-card__lbl">{t('stock.notVisitedLong')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon ic-rate">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.4 14 6.7l5.8.8-4.2 4 1 5.7-5.1-2.7L6.4 17.3l1-5.7-4.2-4 5.8-.8z"/></svg>
          </div>
          <div><div className="stat-card__num">{completionRate}%</div><div className="stat-card__lbl">{language === 'ja' ? '達成率' : 'Completion'}</div></div>
        </div>
      </div>

      <div className="toolbar">
        {/* 検索窓は最上段の .page-search に移動済み（design 準拠） */}
        <div className="tab-pills">
          <button className={`tab-pill ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>{t('map.all')}<span className="tab-pill__count">{stocks.length}</span></button>
          <button className={`tab-pill ${filter === 'unvisited' ? 'is-active' : ''}`} onClick={() => setFilter('unvisited')}>{t('stock.notVisited')}<span className="tab-pill__count">{todoCount}</span></button>
          <button className={`tab-pill ${filter === 'visited' ? 'is-active' : ''}`} onClick={() => setFilter('visited')}>{t('stock.visited')}<span className="tab-pill__count">{visitedCount}</span></button>
        </div>
        <button
          className={`chip-btn ${activeFilterCount > 0 ? 'is-active' : ''}`}
          onClick={() => setFilterOpen(true)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/></svg>
          {t('filter.title')}
          {activeFilterCount > 0 && (
            <span className="chip-btn__count">{activeFilterCount}</span>
          )}
        </button>
        <button className="chip-btn" onClick={() => setSortMode(sortMode === 'added' ? 'distance' : 'added')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
          {sortMode === 'added' ? t('stock.addOrder') : t('stock.distanceOrder')}
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

      {(activeFilterCount > 0 || search) && (
        <div className="active-filters">
          {selectedScenes.map((sc) => (
            <span key={`sc:${sc}`} className="active-filter">
              {localizeScene(sc, language)}
              <button onClick={() => setSelectedScenes((prev) => prev.filter((x) => x !== sc))} aria-label={t('common.clear')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
          {selectedGenres.map((g) => (
            <span key={`g:${g}`} className="active-filter">
              {localizeGenre(g, language)}
              <button onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))} aria-label={t('common.clear')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
          {selectedAreas.map((a) => (
            <span key={`a:${a}`} className="active-filter">
              {localizePrefecture(a, language)}
              <button onClick={() => setSelectedAreas((prev) => prev.filter((x) => x !== a))} aria-label={t('common.clear')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
          {(priceMin > 0 || priceMax < 10000) && (
            <span className="active-filter">
              ¥{priceMin}〜{priceMax >= 10000 ? '' : `¥${priceMax}`}
              <button onClick={() => { setPriceMin(0); setPriceMax(10000); }} aria-label="clear">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </span>
          )}
          <button
            className="clear-all"
            onClick={() => {
              setSelectedScenes([]);
              setSelectedGenres([]);
              setSelectedAreas([]);
              setPriceMin(0);
              setPriceMax(10000);
              setSearch('');
            }}
          >
            {t('common.clear')}
          </button>
        </div>
      )}

      {stocks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--stg-gray-600)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--stg-gray-900)', marginBottom: 6 }}>{t('stock.emptyTitle')}</div>
          <div style={{ fontSize: 13 }}>{t('stock.swipeHint')}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--stg-gray-600)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--stg-gray-900)', marginBottom: 6 }}>{t('stock.noFilterResultsTitle')}</div>
          <div style={{ fontSize: 13 }}>{t('stock.noFilterResultsHint')}</div>
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
                    <button className="stock-card__pin" onClick={(e) => { e.stopPropagation(); onTogglePin(s.id); }} aria-label={t('stock.unpinTooltip')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.5 7 13 7 13s7-7.5 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>
                    </button>
                  )}
                  <div className="stock-card__date">{formatDate(s.stockedAt)}</div>
                  {s.visited && (
                    <div className="stock-card__visited-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      {t('stock.visited')}
                    </div>
                  )}
                  <button
                    className="stock-card__remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(t('stock.deleteConfirmTemplate').replace('{name}', s.name))) onRemoveStock(s.id);
                    }}
                    aria-label={t('stock.deleteAria')}
                  >
                    {/* X を 2 本の独立 path に分けて strokeLinejoin の影響を排除。
                        ボタン 24x24 に対して SVG 12x12 で控えめに。 */}
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="stock-card__body">
                  <h3 className="stock-card__title">{localizeProperNoun(s.name, language)}</h3>
                  <div className="stock-card__meta">
                    {dist && <><span>{dist}</span><span className="stock-card__meta-dot"></span></>}
                    {s.genre && <><span>{localizeGenre(s.genre, language)}</span></>}
                    {s.priceRange && <><span className="stock-card__meta-dot"></span><span>{s.priceRange}</span></>}
                  </div>
                  {handle && (
                    <div className="stock-card__source">
                      <span className={`stock-card__source-dot ${src}`}>{src.toUpperCase()}</span>
                      {t('stock.sourceFoundTemplate').replace('{handle}', handle.startsWith('@') ? handle : `@${handle}`)}
                    </div>
                  )}
                  {chips.length > 0 && (
                    <div className="stock-card__chips">
                      {chips.map((c, i) => (
                        <span key={i} className="stock-card__chip">{localizeTag(c, language)}</span>
                      ))}
                    </div>
                  )}
                  <div className="stock-card__actions">
                    <button
                      className="stock-card__action"
                      onClick={(e) => { e.stopPropagation(); onShowOnMap(s.lat, s.lng, s); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></svg>
                      {t('stock.cardActionMap')}
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
                        {t('stock.cardActionVideo')}
                      </a>
                    ) : (
                      <button className="stock-card__action" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="m6 4 14 8-14 8Z"/></svg>
                        {t('stock.cardActionVideo')}
                      </button>
                    )}
                    {s.visited ? (
                      <button
                        className="stock-card__action stock-card__action--done"
                        onClick={(e) => { e.stopPropagation(); onUnmarkVisited(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        {t('stock.visited')}
                      </button>
                    ) : (
                      <button
                        className="stock-card__action stock-card__action--primary"
                        onClick={(e) => { e.stopPropagation(); onMarkVisited(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        {t('stock.visited')}
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
                  <div className="stock-row__title">{localizeProperNoun(s.name, language)}</div>
                  <div className="stock-row__meta">
                    <span className={`stock-card__source-dot ${src}`}>{src.toUpperCase()}</span>
                    {s.address && <span className="stock-row__meta-address">{s.address}</span>}
                    {dist && <><span className="stock-card__meta-dot"></span><span>{dist}</span></>}
                    {s.genre && <><span className="stock-card__meta-dot"></span><span>{localizeGenre(s.genre, language)}</span></>}
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
                    {t('stock.cardActionMap')}
                  </button>
                  {s.visited ? (
                    <button
                      className="stock-card__action stock-card__action--done"
                      style={{ flex: 'none', padding: '7px 10px' }}
                      onClick={(e) => { e.stopPropagation(); onUnmarkVisited(s.id); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      {t('stock.visited')}
                    </button>
                  ) : (
                    <button
                      className="stock-card__action stock-card__action--primary"
                      style={{ flex: 'none', padding: '7px 10px' }}
                      onClick={(e) => { e.stopPropagation(); onMarkVisited(s.id); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      {t('stock.visited')}
                    </button>
                  )}
                </div>
                <button
                  className="stock-card__action"
                  style={{ flex: 'none', padding: '7px 10px', border: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(t('stock.deleteConfirmTemplate').replace('{name}', s.name))) onRemoveStock(s.id);
                  }}
                  aria-label={t('stock.deleteAria')}
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
            if (window.confirm(t('stock.deleteConfirmTemplate').replace('{name}', preview.name))) {
              onRemoveStock(preview.id);
              setPreview(null);
            }
          }}
          onClose={() => setPreview(null)}
          onShowOnMap={() => onShowOnMap(preview.lat, preview.lng, preview as unknown as StockedRestaurant)}
        />
      )}

      {/* マップ / スワイプ画面と同じ FilterOverlay を流用。
          シーン / ジャンル / エリア / 価格帯 を複数選択で絞り込み。 */}
      {filterOpen && (
        <FilterOverlay
          selectedScenes={selectedScenes}
          selectedGenres={selectedGenres}
          selectedAreas={selectedAreas}
          priceMin={priceMin}
          priceMax={priceMax}
          onScenesChange={setSelectedScenes}
          onGenresChange={setSelectedGenres}
          onAreasChange={setSelectedAreas}
          onPriceChange={(min, max) => { setPriceMin(min); setPriceMax(max); }}
          onClose={() => setFilterOpen(false)}
          onApply={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
