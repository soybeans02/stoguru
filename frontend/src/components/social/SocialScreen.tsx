import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';
import { UserProfileModal } from '../user/UserProfileModal';
import { distanceMetres } from '../../utils/distance';

type SubView = 'main' | 'notifications' | 'following' | 'requests';

/** 2 点間の距離（km）。共通ヘルパー distanceMetres ベースで重複実装を排除。 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return distanceMetres(lat1, lng1, lat2, lng2) / 1000;
}

interface Props {
  onUnreadCount?: (count: number) => void;
  initialView?: string | null;
  onInitViewConsumed?: () => void;
  onGoHome?: () => void;
  /** ホームから検索が呼ばれた時の初期クエリ */
  initialQuery?: string | null;
  onInitQueryConsumed?: () => void;
  /** ホームのエリア欄で「点」（駅/POI）が選ばれた時の半径フィルタ */
  initialGeo?: { lat: number; lng: number; radiusKm: number } | null;
  onInitGeoConsumed?: () => void;
}

export function SocialScreen({ onUnreadCount, initialView, onInitViewConsumed, onGoHome, initialQuery, onInitQueryConsumed, initialGeo, onInitGeoConsumed }: Props) {
  const { user } = useAuth();
  const myId = user?.userId ?? '';
  const [view, setView] = useState<SubView>(() => {
    if (initialView === 'notifications') return 'notifications';
    return 'main';
  });
  const cameFromHome = useRef(initialView === 'notifications');

  const handleBack = useCallback(() => {
    if (cameFromHome.current) {
      cameFromHome.current = false;
      onGoHome?.();
    } else {
      setView('main');
    }
  }, [onGoHome]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<api.SearchResult>({ users: [], restaurants: [], urlMatch: null });
  /** ホームから渡された半径フィルタ（駅/POI 選択時のみ）。検索バー手動入力で解除 */
  const [geoFilter, setGeoFilter] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [stockingUrl, setStockingUrl] = useState(false);
  const [stockSuccess, setStockSuccess] = useState<string | null>(null);
  const [stockedRestaurants, setStockedRestaurants] = useState<Set<string>>(new Set());
  const [stockingRestaurant, setStockingRestaurant] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 「すべてのお店」（Google Places 列挙）は web では出さないので Maps SDK は不要。
  // 旧コードのロード一式は削除済み（API リクエスト課金抑制）。

  // Profile modal
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<api.Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  // Following
  const [following, setFollowing] = useState<{ followeeId: string; nickname?: string }[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);

  // Follow requests
  const [followRequests, setFollowRequests] = useState<{ requesterId: string; createdAt: number; nickname?: string }[]>([]);

  // Counts for main view
  const [requestCount, setRequestCount] = useState(0);

  // Ranking
  const [ranking, setRanking] = useState<api.RankedUser[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  // initialViewが渡された場合、対応するサブビューに遷移
  useEffect(() => {
    if (initialView === 'notifications') {
      setView('notifications');
      loadNotifications();
      onInitViewConsumed?.();
    }
  }, [initialView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ホームから初期クエリ / geo フィルタが渡されたら検索実行
  useEffect(() => {
    // initialGeo は initialQuery と同時に来るので一括で処理
    if (initialQuery !== null && initialQuery !== undefined) {
      setView('main');
      // 先に geo フィルタをセット（handleSearch 内で参照されるよう state ではなく ref 経由）
      if (initialGeo) setGeoFilter(initialGeo);
      else setGeoFilter(null);
      handleSearch(initialQuery, initialGeo ?? null);
      onInitQueryConsumed?.();
      onInitGeoConsumed?.();
    }
  }, [initialQuery, initialGeo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load counts on mount
  useEffect(() => {
    api.getFollowing().then(f => setFollowing(f)).catch(() => {});

    api.getNotifications().then(n => {
      setNotifications(n);
      onUnreadCount?.(n.filter(x => !x.read).length);
    }).catch(() => {});

    api.getFollowRequests().then(r => {
      setRequestCount(r.length);
      setFollowRequests(r.map(x => ({ ...x, nickname: undefined })));
    }).catch(() => {});

    api.getStockRanking().then(r => {
      setRanking(r);
    }).catch(() => {}).finally(() => setRankingLoading(false));

  }, [myId, onUnreadCount]);

  // Search with debounce
  // geoOverride を渡すとそれを優先（ホームから初期検索される時に使う）。
  // 渡さなければ state の geoFilter を参照。
  const handleSearch = useCallback((q: string, geoOverride?: { lat: number; lng: number; radiusKm: number } | null) => {
    setSearchQuery(q);
    setStockSuccess(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const effectiveGeo = geoOverride !== undefined ? geoOverride : geoFilter;
    // クエリも geo も無ければ結果クリア
    if (!q.trim() && !effectiveGeo) {
      setSearchResults({ users: [], restaurants: [], urlMatch: null });
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        let results: api.SearchResult;
        if (q.trim()) {
          results = await api.unifiedSearch(q.trim());
          results.users = results.users.filter((r) => r.userId !== myId);
        } else {
          // キーワード無し + geo のみ：周辺フィードを取得して「お店」一覧に流用
          results = { users: [], restaurants: [], urlMatch: null };
          if (effectiveGeo) {
            try {
              const nearby = (await api.fetchRestaurantFeed(effectiveGeo.lat, effectiveGeo.lng, effectiveGeo.radiusKm * 1000, 50)) as Array<{
                id: string; name: string; address?: string; lat?: number; lng?: number;
                genres?: string[]; priceRange?: string; photoUrls?: string[]; influencer?: string;
              }>;
              results.restaurants = (nearby ?? []).map((r) => ({
                restaurantId: r.id,
                name: r.name,
                address: r.address,
                lat: r.lat,
                lng: r.lng,
                genres: r.genres,
                priceRange: r.priceRange,
                photoUrls: r.photoUrls,
                influencer: r.influencer,
              }));
            } catch { /* ignore */ }
          }
        }
        // geo フィルタ適用：lat/lng が分かるレストランのみを残し、半径外を除外
        if (effectiveGeo) {
          results.restaurants = results.restaurants.filter((r) => {
            if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return false;
            return haversineKm(effectiveGeo.lat, effectiveGeo.lng, r.lat, r.lng) <= effectiveGeo.radiusKm;
          });
          if (results.urlMatch) {
            const u = results.urlMatch;
            if (typeof u.lat !== 'number' || typeof u.lng !== 'number' ||
                haversineKm(effectiveGeo.lat, effectiveGeo.lng, u.lat, u.lng) > effectiveGeo.radiusKm) {
              results.urlMatch = null;
            }
          }
        }
        setSearchResults(results);
      } catch { setSearchResults({ users: [], restaurants: [], urlMatch: null }); }
      setSearching(false);
    }, 400);
  }, [myId, geoFilter]);

  // SocialScreen 内の検索バー手動入力で値が変わると geo フィルタは解除
  const handleSearchInputChange = useCallback((q: string) => {
    setGeoFilter(null);
    handleSearch(q, null);
  }, [handleSearch]);

  const handleStockByUrl = useCallback(async (url: string) => {
    setStockingUrl(true);
    try {
      const res = await api.stockByUrl(url);
      setStockSuccess(res.name ?? 'お店');
    } catch { setStockSuccess(null); }
    finally { setStockingUrl(false); }
  }, []);

const handleStockRestaurant = useCallback(async (r: api.SearchResult['restaurants'][0]) => {
    setStockingRestaurant(r.restaurantId);
    try {
      await api.putRestaurant({
        id: r.restaurantId,
        name: r.name,
        address: r.address ?? '',
        genres: r.genres ?? [],
        photoUrls: r.photoUrls ?? [],
        source: 'influencer',
      });
      setStockedRestaurants(prev => new Set(prev).add(r.restaurantId));
    } catch {}
    finally { setStockingRestaurant(null); }
  }, []);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const n = await api.getNotifications();
      setNotifications(n);
      // Mark as read
      await api.markNotificationsRead();
      onUnreadCount?.(0);
    } catch {}
    finally { setNotifLoading(false); }
  }, [onUnreadCount]);

  // Load follow requests with nicknames
  const loadFollowRequests = useCallback(async () => {
    setFollowListLoading(true);
    try {
      const reqs = await api.getFollowRequests();
      const withNicks = await Promise.all(reqs.map(async (r) => {
        try {
          const p = await api.getUserProfile(r.requesterId);
          return { ...r, nickname: p.nickname };
        } catch { return { ...r, nickname: undefined }; }
      }));
      setFollowRequests(withNicks);
      setRequestCount(withNicks.length);
    } catch {}
    finally { setFollowListLoading(false); }
  }, []);

  const handleApproveRequest = async (requesterId: string) => {
    try {
      await api.approveFollowRequest(requesterId);
      setFollowRequests(prev => prev.filter(r => r.requesterId !== requesterId));
      setRequestCount(prev => prev - 1);
    } catch {}
  };

  const handleRejectRequest = async (requesterId: string) => {
    try {
      await api.rejectFollowRequest(requesterId);
      setFollowRequests(prev => prev.filter(r => r.requesterId !== requesterId));
      setRequestCount(prev => prev - 1);
    } catch {}
  };

  function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '今';
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    return `${Math.floor(hr / 24)}日前`;
  }

  function notifIcon(type: string) {
    switch (type) {
      case 'follow': return '👤';
      case 'follow_request': return '🔔';
      case 'follow_accepted': return '✅';
      default: return '🔔';
    }
  }

  function notifText(n: api.Notification) {
    switch (n.type) {
      case 'follow': return `${n.fromNickname}があなたをフォローしました`;
      case 'follow_request': return `${n.fromNickname}からフォローリクエスト`;
      case 'follow_accepted': return `${n.fromNickname}がフォローリクエストを承認しました`;
      default: return '通知';
    }
  }

  // Profile modal handler
  const openProfile = (userId: string) => setProfileUserId(userId);

  // === Sub views ===
  if (view === 'notifications') {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
        <Header title="通知" onBack={handleBack} />
        <div className="flex-1 overflow-y-auto">
          {notifLoading && <p className="text-center text-gray-400 text-sm py-8">読み込み中...</p>}
          {!notifLoading && notifications.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">通知はまだありません</p>
          )}
          {notifications.map((n, i) => (
            <button
              key={`${n.createdAt}-${i}`}
              onClick={() => openProfile(n.fromUserId)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-800 ${
                !n.read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
              }`}
            >
              <span className="text-xl w-8 text-center">{notifIcon(n.type)}</span>
              <div className="flex-1 text-left min-w-0">
                <p className={`text-sm ${!n.read ? 'font-semibold' : ''} text-gray-900 dark:text-white`}>
                  {notifText(n)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
        {profileUserId && (
          <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
        )}
      </div>
    );
  }

  if (view === 'following') {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
        <Header title="フォロー中" onBack={() => setView('main')} />
        <div className="flex-1 overflow-y-auto">
          {followListLoading && <p className="text-center text-gray-400 text-sm py-8">読み込み中...</p>}
          {!followListLoading && following.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">まだフォローしていません</p>
          )}
          {following.map(f => (
            <button
              key={f.followeeId}
              onClick={() => openProfile(f.followeeId)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white font-bold text-sm">
                {(f.nickname ?? '?').charAt(0)}
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{f.nickname ?? f.followeeId}</span>
            </button>
          ))}
        </div>
        {profileUserId && (
          <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
        )}
      </div>
    );
  }

  if (view === 'requests') {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
        <Header title="フォローリクエスト" onBack={() => setView('main')} />
        <div className="flex-1 overflow-y-auto">
          {followListLoading && <p className="text-center text-gray-400 text-sm py-8">読み込み中...</p>}
          {!followListLoading && followRequests.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">リクエストはありません</p>
          )}
          {followRequests.map(r => (
            <div
              key={r.requesterId}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800"
            >
              <button onClick={() => openProfile(r.requesterId)} className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-300 flex items-center justify-center text-white font-bold text-sm">
                {(r.nickname ?? '?').charAt(0)}
              </button>
              <button onClick={() => openProfile(r.requesterId)} className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{r.nickname ?? r.requesterId}</p>
                <p className="text-[11px] text-gray-400">{timeAgo(r.createdAt)}</p>
              </button>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleApproveRequest(r.requesterId)}
                  className="px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg"
                >
                  承認
                </button>
                <button
                  onClick={() => handleRejectRequest(r.requesterId)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-lg"
                >
                  拒否
                </button>
              </div>
            </div>
          ))}
        </div>
        {profileUserId && (
          <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
        )}
      </div>
    );
  }

  // === Main social hub ===
  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 md:px-6 lg:px-8 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">検索</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pb-6">
        {/* Search bar - inline */}
        <div className="relative mb-4">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <input
            value={searchQuery}
            onChange={e => handleSearchInputChange(e.target.value)}
            placeholder="ユーザー・お店・URLで検索..."
            className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults({ users: [], restaurants: [], urlMatch: null }); setStockSuccess(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Search results */}
        {searching && <p className="text-center text-gray-400 text-sm py-4">検索中...</p>}
        {!searching && searchQuery && !searchResults.users.length && !searchResults.restaurants.length && !searchResults.urlMatch && (
          <p className="text-center text-gray-400 text-sm py-4">見つかりませんでした</p>
        )}

        {/* URL match */}
        {searchResults.urlMatch && (
          <div className="mb-4">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">一致したお店</h3>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                {searchResults.urlMatch.photoUrls?.[0] ? (
                  <img loading="lazy" src={searchResults.urlMatch.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">🍽️</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{searchResults.urlMatch.name}</p>
                {searchResults.urlMatch.influencer && (
                  <p className="text-[11px] text-gray-400">by {searchResults.urlMatch.influencer}</p>
                )}
              </div>
              {stockSuccess ? (
                <span className="text-xs text-green-500 font-medium shrink-0">保存済み ✓</span>
              ) : (
                <button
                  onClick={() => handleStockByUrl(searchQuery)}
                  disabled={stockingUrl}
                  className="px-4 py-2 bg-orange-500 text-white text-xs font-medium rounded-lg shrink-0 disabled:opacity-50"
                >
                  {stockingUrl ? '...' : '保存する'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Restaurant results - influencer cards */}
        {searchResults.restaurants.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">登録済みのお店</h3>
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:grid-cols-3">
              {searchResults.restaurants.map(r => (
                <div key={r.restaurantId} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                  {/* Photo */}
                  <div className="w-full h-40 bg-gray-100 dark:bg-gray-700 relative">
                    {r.photoUrls?.[0] ? (
                      <img loading="lazy" src={r.photoUrls[0]} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl">🍽️</span>
                      </div>
                    )}
                    {r.influencer && (
                      <span className="absolute bottom-2 left-2 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px]">
                        by {r.influencer}
                      </span>
                    )}
                  </div>
                  {/* Info + Save button */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{r.name}</h4>
                      <p className="text-[11px] text-gray-400 truncate">
                        {[r.genres?.slice(0, 2).join('・'), r.priceRange].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {stockedRestaurants.has(r.restaurantId) ? (
                      <span className="text-xs text-green-500 font-medium shrink-0">追加済み</span>
                    ) : (
                      <button
                        onClick={() => handleStockRestaurant(r)}
                        disabled={stockingRestaurant === r.restaurantId}
                        className="px-4 py-2 bg-orange-500 text-white text-xs font-medium rounded-lg shrink-0 disabled:opacity-50"
                      >
                        {stockingRestaurant === r.restaurantId ? '...' : '追加'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User results */}
        {searchResults.users.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">ユーザー</h3>
            {searchResults.users.map(u => (
              <button
                key={u.userId}
                onClick={() => openProfile(u.userId)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white font-bold text-sm">
                  {u.nickname.charAt(0)}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{u.nickname}</span>
              </button>
            ))}
          </div>
        )}

        {/* Menu cards */}
        {!searchQuery && (
          <>
            <div className="space-y-2">
              {/* Follow requests */}
              {requestCount > 0 && (
                <MenuCard
                  icon={<div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 11l2 2 4-4"/></svg>
                  </div>}
                  label="フォローリクエスト"
                  badge={requestCount}
                  onClick={() => { setView('requests'); loadFollowRequests(); }}
                />
              )}
            </div>

            {/* 保存ランキング — Top 3 のみ表示（合計 3 人固定、4位以降は除外）*/}
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">保存ランキング Top 3</h2>
              {rankingLoading ? (
                <p className="text-center text-gray-400 text-sm py-6">読み込み中...</p>
              ) : ranking.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">まだデータがありません</p>
              ) : (
                <div className="space-y-1">
                  {ranking.slice(0, 3).map((r, i) => {
                    const rank = i + 1;
                    return (
                    <button
                      key={r.userId}
                      onClick={() => openProfile(r.userId)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className={`w-6 text-center font-bold text-sm ${
                        rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-amber-700'
                      }`}>
                        {rank}
                      </span>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                        {r.profilePhotoUrl ? (
                          <img src={r.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          r.nickname.charAt(0)
                        )}
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white truncate">{r.nickname}</span>
                      <span className="text-xs text-gray-400">{r.totalStocks} 保存</span>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Profile modal */}
      {profileUserId && (
        <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  );
}

// --- Sub components ---

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
    </div>
  );
}

function MenuCard({ icon, label, badge, count, onClick }: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      {icon}
      <span className="flex-1 text-left text-[15px] font-medium text-gray-900 dark:text-white">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      )}
      {count !== undefined && (
        <span className="text-sm text-gray-400">{count}</span>
      )}
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 dark:text-gray-600"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}
