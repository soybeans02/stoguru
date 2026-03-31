import { useState, useEffect } from 'react';
import { Map, Bookmark, Settings, LogOut, Users, ChevronRight, Trash2, Lock, Shield, Bell, MessageCircle, KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as api from '../../utils/api';

type Tab = 'map' | 'list' | 'keep';
type SettingsPage = 'main' | 'account' | 'password' | 'privacy' | 'following' | 'stat-all' | 'stat-reviewed' | 'stat-wishlist';

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(timestamp).toLocaleDateString('ja-JP');
}

interface FollowedUser {
  userId: string;
  nickname: string;
}

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  onOpenProfile?: (userId: string) => void;
  onJumpToMap?: (lat: number, lng: number) => void;
  onOpenMessage?: () => void;
  messageCount?: number;
}

function PasswordChangePage({ onBack }: { onBack: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPw.length < 8) { setError('新しいパスワードは8文字以上にしてください'); return; }
    if (newPw !== confirmPw) { setError('新しいパスワードが一致しません'); return; }
    setSaving(true);
    try {
      await api.changePassword(oldPw, newPw);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワード変更に失敗しました');
    } finally { setSaving(false); }
  }

  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-green-600 font-medium">パスワードを変更しました</p>
        <button onClick={onBack} className="text-sm text-blue-500 hover:text-blue-600">戻る</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">現在のパスワード</label>
        <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)}
          className="w-full text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 outline-none focus:ring-2 focus:ring-orange-300" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">新しいパスワード（8文字以上）</label>
        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
          className="w-full text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 outline-none focus:ring-2 focus:ring-orange-300" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">新しいパスワード（確認）</label>
        <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
          className="w-full text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 outline-none focus:ring-2 focus:ring-orange-300" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={saving || !oldPw || !newPw || !confirmPw}
        className="w-full bg-orange-500 text-white text-sm py-2.5 rounded-xl font-medium hover:bg-orange-600 disabled:opacity-50">
        {saving ? '変更中...' : 'パスワードを変更'}
      </button>
    </form>
  );
}

export function Header({ activeTab, onTabChange, onOpenProfile, onJumpToMap, onOpenMessage, messageCount: externalMsgCount }: Props) {
  const { user, logout } = useAuth();
  const { state } = useRestaurantContext();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage>('main');
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<api.Notification[]>([]);
  const [followRequests, setFollowRequests] = useState<{ requesterId: string; nickname: string }[]>([]);
  const [messageCount, setMessageCount] = useState(0);

  const totalRestaurants = state.restaurants.length;
  const reviewed = state.restaurants.filter((r) => r.review).length;
  const wishlist = totalRestaurants - reviewed;

  const unreadCount = notifications.filter((n) => !n.read).length + followRequests.length;

  // 通知を定期的にロード（エラー時はバックオフ）
  useEffect(() => {
    let failCount = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function loadNotifications() {
      try {
        const [notifs, reqs] = await Promise.all([
          api.getNotifications(),
          api.getFollowRequests(),
        ]);
        if (cancelled) return;
        setNotifications(notifs);
        const items: { requesterId: string; nickname: string }[] = [];
        for (const r of reqs) {
          try {
            const profile = await api.getUserProfile(r.requesterId);
            items.push({ requesterId: r.requesterId, nickname: profile.nickname });
          } catch { /* skip */ }
        }
        setFollowRequests(items);
        failCount = 0; // 成功したらリセット
      } catch {
        failCount = Math.min(failCount + 1, 5);
      }
      if (!cancelled) {
        // エラー時は間隔を延長（30s → 60s → 120s → 240s → 480s）
        const delay = 30000 * Math.pow(2, failCount);
        timer = setTimeout(loadNotifications, delay);
      }
    }

    loadNotifications();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // 外部からカウントが渡された場合はそれを使用
  useEffect(() => {
    if (externalMsgCount !== undefined) {
      setMessageCount(externalMsgCount);
    }
  }, [externalMsgCount]);

  async function handleOpenNotif() {
    setNotifOpen((v) => !v);
    // 開いたら既読にする
    if (!notifOpen && notifications.some((n) => !n.read)) {
      api.markNotificationsRead().then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }).catch(() => {});
    }
  }

  async function handleApprove(requesterId: string) {
    try {
      await api.approveFollowRequest(requesterId);
      setFollowRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
    } catch { /* ignore */ }
  }

  async function handleReject(requesterId: string) {
    try {
      await api.rejectFollowRequest(requesterId);
      setFollowRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!settingsOpen) return;
    api.getFollowing().then(async (following) => {
      const users: FollowedUser[] = [];
      for (const f of following) {
        try {
          const profile = await api.getUserProfile(f.followeeId);
          users.push({ userId: profile.userId, nickname: profile.nickname });
        } catch { /* skip */ }
      }
      setFollowedUsers(users);
    }).catch(() => {});

    api.getPrivacySettings().then((s) => setIsPrivate(s.isPrivate)).catch(() => {});
  }, [settingsOpen]);

  function closeSettings() {
    setSettingsOpen(false);
    setPage('main');
  }

  async function togglePrivate() {
    setPrivacyLoading(true);
    try {
      const newVal = !isPrivate;
      await api.setPrivateAccount(newVal);
      setIsPrivate(newVal);
    } catch { /* ignore */ }
    setPrivacyLoading(false);
  }

  async function handleDeleteAccount() {
    if (!confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) return;
    if (!confirm('すべてのデータ（ストック・レビュー・フォロー）が完全に削除されます。よろしいですか？')) return;
    setDeleting(true);
    try {
      await api.deleteAccount();
      localStorage.clear();
      window.location.reload();
    } catch {
      alert('アカウント削除に失敗しました');
      setDeleting(false);
    }
  }

  function getStatRestaurants(filter: 'all' | 'reviewed' | 'wishlist') {
    return state.restaurants.filter((r) => {
      if (filter === 'reviewed') return !!r.review;
      if (filter === 'wishlist') return !r.review;
      return true;
    });
  }

  const pageTitle: Record<SettingsPage, string> = {
    main: '設定',
    account: 'アカウント',
    password: 'パスワード変更',
    privacy: 'プライバシー',
    following: `フォロー中 (${followedUsers.length})`,
    'stat-all': 'すべてのストック',
    'stat-reviewed': 'レビュー済み',
    'stat-wishlist': '行きたい',
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-20 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 max-w-xl mx-auto">
          <button onClick={() => window.location.reload()} className="text-base font-bold text-gray-900 hover:opacity-70 transition-opacity">
            <svg width="28" height="28" viewBox="0 0 80 80" className="inline-block -mt-1">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#FF6B6B'}}/>
                  <stop offset="100%" style={{stopColor:'#FF8E53'}}/>
                </linearGradient>
              </defs>
              <path d="M40 4C25.088 4 13 16.088 13 31c0 20.25 27 43 27 43s27-22.75 27-43C67 16.088 54.912 4 40 4z" fill="url(#logo-grad)"/>
              <g transform="translate(40,40) rotate(-22)">
                <line x1="0" y1="-22" x2="0" y2="6" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="-3" y1="-22" x2="-3" y2="-14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="3" y1="-22" x2="3" y2="-14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M-3 -14 Q0 -10 3 -14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </g>
              <g transform="translate(40,40) rotate(22)">
                <line x1="0" y1="-22" x2="0" y2="6" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M0 -22 Q5 -16 0 -10" fill="white" opacity="0.85"/>
              </g>
            </svg>
            {' '}ストグル
          </button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={handleOpenNotif} className="p-2 text-gray-500 hover:text-gray-800">
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border z-50 overflow-hidden">
                  <div className="px-3 py-2.5 border-b bg-gray-50">
                    <p className="text-sm font-semibold text-gray-800">通知</p>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {/* フォローリクエスト（承認/拒否ボタン付き） */}
                    {followRequests.map((r) => (
                      <div key={'req-' + r.requesterId} className="flex items-center gap-2.5 px-3 py-2.5 border-b bg-blue-50/50">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {r.nickname.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-800 truncate">
                            <span className="font-semibold">{r.nickname}</span> がフォローリクエスト
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleApprove(r.requesterId)}
                            className="text-xs bg-blue-500 text-white px-2.5 py-1 rounded-full hover:bg-blue-600"
                          >
                            承認
                          </button>
                          <button
                            onClick={() => handleReject(r.requesterId)}
                            className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full hover:bg-gray-200"
                          >
                            拒否
                          </button>
                        </div>
                        </div>
                      ))
                    }
                    {/* 一般通知（フォローしました等） — 既読も薄く残す */}
                    {notifications.map((n) => (
                      <div
                        key={n.createdAt}
                        className={`flex items-center gap-2.5 px-3 py-2.5 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${!n.read ? 'bg-blue-50/30' : ''}`}
                        onClick={() => { setNotifOpen(false); onOpenProfile?.(n.fromUserId); }}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          n.read
                            ? 'bg-gray-200 text-gray-400'
                            : 'bg-gradient-to-br from-blue-400 to-cyan-300 text-white'
                        }`}>
                          {n.fromNickname.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs truncate ${n.read ? 'text-gray-400' : 'text-gray-800'}`}>
                            <span className={n.read ? 'font-normal' : 'font-semibold'}>{n.fromNickname}</span>
                            {n.type === 'follow' && ' があなたをフォローしました'}
                            {n.type === 'follow_request' && ' がフォローリクエストを送りました'}
                            {n.type === 'follow_accepted' && ' がフォローリクエストを承認しました'}
                            {n.type === 'message_request' && ` からメッセージリクエスト${n.content ? `：${n.content}` : ''}`}
                            {n.type === 'message' && ` からメッセージ${n.content ? `：${n.content}` : ''}`}
                          </p>
                          <p className="text-[10px] text-gray-300">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                        {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>
                    ))}
                    {followRequests.length === 0 && notifications.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6">通知はありません</p>
                    )}
                  </div>
                </div>
                </>
              )}
            </div>
            <button onClick={() => onOpenMessage?.()} className="p-2 text-gray-500 hover:text-gray-800 relative">
              <MessageCircle size={22} />
              {messageCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {messageCount > 99 ? '99+' : messageCount}
                </span>
              )}
            </button>
            <button onClick={() => { setSettingsOpen(true); setPage('main'); }} className="p-2 text-gray-500 hover:text-gray-800 mr-1">
              <Settings size={22} />
            </button>
          </div>
        </div>
        <nav className="flex border-t max-w-xl mx-auto">
          {([
            { id: 'map', label: 'マップ', icon: Map },
            { id: 'list', label: 'キープ', icon: Bookmark },
            { id: 'keep', label: '友達', icon: Users },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                activeTab === id ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <Modal isOpen={settingsOpen} onClose={closeSettings} title={pageTitle[page]}>
        {/* 戻るボタン（メインページ以外） */}
        {page !== 'main' && (
          <button
            onClick={() => setPage(page === 'password' ? 'account' : 'main')}
            className="text-sm text-blue-500 hover:text-blue-600 mb-3 -mt-1"
          >
            ← 戻る
          </button>
        )}

        {/* ─── メインページ（リスト形式） ─── */}
        {page === 'main' && (
          <div className="space-y-5">
            {/* プロフィールカード */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-400 to-orange-300 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                {user?.nickname?.charAt(0) ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-base truncate">{user?.nickname}</p>
                  {isPrivate && <Lock size={13} className="text-gray-400 shrink-0" />}
                </div>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>

            {/* 統計 */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setPage('stat-all')} className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors">
                <p className="text-lg font-bold text-gray-900">{totalRestaurants}</p>
                <p className="text-xs text-gray-400">ストック</p>
              </button>
              <button onClick={() => setPage('stat-reviewed')} className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors">
                <p className="text-lg font-bold text-green-500">{reviewed}</p>
                <p className="text-xs text-gray-400">レビュー済</p>
              </button>
              <button onClick={() => setPage('stat-wishlist')} className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors">
                <p className="text-lg font-bold text-red-400">{wishlist}</p>
                <p className="text-xs text-gray-400">行きたい</p>
              </button>
            </div>

            {/* 設定メニューリスト */}
            <div className="space-y-1">
              <button onClick={() => setPage('following')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Users size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-800 flex-1 text-left">フォロー中</span>
                <span className="text-xs text-gray-400 mr-1">{followedUsers.length}</span>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
              <button onClick={() => setPage('privacy')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Shield size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-800 flex-1 text-left">プライバシー</span>
                {isPrivate && <Lock size={13} className="text-gray-400" />}
                <ChevronRight size={16} className="text-gray-300" />
              </button>
              <button onClick={() => setPage('account')} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Settings size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-800 flex-1 text-left">アカウント</span>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            </div>
          </div>
        )}

        {/* ─── フォロー一覧ページ ─── */}
        {page === 'following' && (
          <div className="space-y-1.5">
            {followedUsers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">まだ誰もフォローしていません</p>
            ) : (
              followedUsers.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => {
                    closeSettings();
                    onOpenProfile?.(u.userId);
                  }}
                  className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 hover:bg-gray-100 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {u.nickname.charAt(0)}
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate flex-1 text-left">{u.nickname}</p>
                  <ChevronRight size={14} className="text-gray-300" />
                </button>
              ))
            )}
          </div>
        )}

        {/* ─── プライバシーページ ─── */}
        {page === 'privacy' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-gray-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">鍵アカウント</p>
                  <p className="text-xs text-gray-400">フォロワーのみ情報を閲覧可能</p>
                </div>
              </div>
              <button
                onClick={togglePrivate}
                disabled={privacyLoading}
                className={`relative w-11 h-6 rounded-full transition-colors ${isPrivate ? 'bg-blue-500' : 'bg-gray-300'} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isPrivate ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-400 px-1">
              ONにすると、フォローしていないユーザーからはストックしているお店やレビューが見えなくなります。ニックネームと登録日は常に表示されます。
            </p>
          </div>
        )}

        {/* ─── アカウントページ ─── */}
        {page === 'account' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">メールアドレス</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">ニックネーム</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{user?.nickname}</p>
            </div>
            <button
              onClick={() => setPage('password')}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <KeyRound size={18} className="text-gray-400" />
              <span className="text-sm text-gray-700 flex-1 text-left">パスワード変更</span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
            <hr className="border-gray-100" />
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 w-full py-2"
            >
              <LogOut size={16} /> ログアウト
            </button>
            <hr className="border-gray-100" />
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 w-full py-2 disabled:opacity-50"
            >
              <Trash2 size={16} /> {deleting ? '削除中...' : 'アカウントを削除'}
            </button>
          </div>
        )}

        {/* ─── パスワード変更ページ ─── */}
        {page === 'password' && (
          <PasswordChangePage onBack={() => setPage('account')} />
        )}

        {/* ─── 統計一覧ページ ─── */}
        {(page === 'stat-all' || page === 'stat-reviewed' || page === 'stat-wishlist') && (
          <div className="space-y-1.5">
            {(() => {
              const filter = page === 'stat-all' ? 'all' : page === 'stat-reviewed' ? 'reviewed' : 'wishlist';
              const items = getStatRestaurants(filter);
              if (items.length === 0) return <p className="text-sm text-gray-400 text-center py-8">お店がありません</p>;
              return items.map((r) => (
                <button
                  key={r.id}
                  className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 hover:bg-gray-100 transition-colors text-left"
                  onClick={() => {
                    if (r.lat != null && r.lng != null) {
                      closeSettings();
                      onJumpToMap?.(r.lat, r.lng);
                    }
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.review ? '#86efac' : '#ef4444', opacity: r.review ? 0.85 : 1 }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    {r.address && <p className="text-xs text-gray-400 truncate">{r.address}</p>}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ));
            })()}
          </div>
        )}
      </Modal>
    </>
  );
}
