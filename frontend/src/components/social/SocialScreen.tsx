import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../utils/api';
import { UserProfileModal } from '../user/UserProfileModal';

type SubView = 'main' | 'notifications' | 'following' | 'requests';

interface Props {
  onUnreadCount?: (count: number) => void;
  initialView?: string | null;
  onInitViewConsumed?: () => void;
  onGoHome?: () => void;
}

export function SocialScreen({ onUnreadCount, initialView, onInitViewConsumed, onGoHome }: Props) {
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
  const [searchResults, setSearchResults] = useState<{ userId: string; nickname: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchUsers(q.trim());
        setSearchResults(results.filter(r => r.userId !== myId));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [myId]);

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
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">検索</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Search bar - inline */}
        <div className="relative mb-4">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ユーザーを検索..."
            className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Search results */}
        {searching && <p className="text-center text-gray-400 text-sm py-4">検索中...</p>}
        {!searching && searchQuery && searchResults.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-4">見つかりませんでした</p>
        )}
        {searchResults.length > 0 && (
          <div className="mb-4">
            {searchResults.map(u => (
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

            {/* 保存ランキング */}
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">保存ランキング</h2>
              {rankingLoading ? (
                <p className="text-center text-gray-400 text-sm py-6">読み込み中...</p>
              ) : ranking.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">まだデータがありません</p>
              ) : (
                <div className="space-y-1">
                  {ranking.map((r, i) => (
                    <button
                      key={r.userId}
                      onClick={() => openProfile(r.userId)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className={`w-6 text-center font-bold text-sm ${
                        i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'
                      }`}>
                        {i + 1}
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
                  ))}
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
