import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, LogOut, Users, BarChart3, Database, Key, MapPin, Activity, Ban, CheckCircle, KeyRound, Trash2, MessageSquare, Bug, Lightbulb, MessageCircle, Mail, MailOpen } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api') + '/admin';

interface UserInfo {
  userId: string;
  email: string;
  nickname: string;
  status: string;
  createdAt: string;
  enabled: boolean;
}

interface Stats {
  total: number;
  startedAt: string;
  byEndpoint: [string, number][];
  byHour: Record<string, number>;
}

interface DeletedAccount {
  userId: string;
  email: string;
  nickname: string;
  deletedAt: number;
  deletedBy: 'self' | 'admin';
}

interface FeedbackItem {
  id: string;
  userId: string;
  nickname: string;
  email: string;
  message: string;
  category: 'bug' | 'feature' | 'support' | 'other';
  createdAt: number;
  read: boolean;
  replyEmail?: string;
}

const FEEDBACK_META = {
  bug: { label: '不具合', icon: Bug, color: 'text-red-300', bg: 'bg-red-900/30' },
  feature: { label: '機能要望', icon: Lightbulb, color: 'text-yellow-300', bg: 'bg-yellow-900/30' },
  support: { label: 'サポート', icon: Mail, color: 'text-orange-300', bg: 'bg-orange-900/30' },
  other: { label: 'その他', icon: MessageCircle, color: 'text-blue-300', bg: 'bg-blue-900/30' },
} as const;

// 共通のアイテム表示コンポーネント
function FeedbackCard({
  item,
  onMarkRead,
  onRemove,
  showReplyEmail,
}: {
  item: FeedbackItem;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  showReplyEmail?: boolean;
}) {
  const meta = FEEDBACK_META[item.category] ?? FEEDBACK_META.other;
  const Icon = meta.icon;
  return (
    <div className={`bg-gray-800 rounded-xl p-4 space-y-2 border ${item.read ? 'border-gray-700' : 'border-orange-500/50'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium`}>
          <Icon size={11} /> {meta.label}
        </span>
        {!item.read && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-600 text-white font-bold">NEW</span>
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {new Date(item.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="text-sm text-gray-300 whitespace-pre-wrap break-words">
        {item.message}
      </div>

      <div className="flex flex-col gap-1 text-xs text-gray-500 pt-1 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-400">{item.nickname}</span>
          <span>{item.email}</span>
        </div>
        {showReplyEmail && item.replyEmail && (
          <div className="flex items-center gap-1 text-orange-300">
            <Mail size={11} />
            <span>返信用: </span>
            <a href={`mailto:${item.replyEmail}`} className="underline hover:text-orange-200">
              {item.replyEmail}
            </a>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {!item.read ? (
          <button
            onClick={() => onMarkRead(item.id)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-900/50 text-blue-300 hover:bg-blue-900"
          >
            <MailOpen size={12} /> 既読にする
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs px-2 py-1 text-gray-500">
            <Mail size={12} /> 既読
          </span>
        )}
        {showReplyEmail && (item.replyEmail || item.email) && (
          <a
            href={`mailto:${item.replyEmail || item.email}?subject=${encodeURIComponent('Re: stoguru サポート')}`}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-900/50 text-green-300 hover:bg-green-900"
          >
            <Mail size={12} /> 返信する
          </a>
        )}
        <button
          onClick={() => onRemove(item.id)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-300 hover:bg-red-900"
        >
          <Trash2 size={12} /> 削除
        </button>
      </div>
    </div>
  );
}

// フィードバック / サポート の共通ベースセクション
function FeedbackBaseSection({
  token,
  title,
  icon: HeaderIcon,
  categories,
  showReplyEmail,
  emptyLabel,
}: {
  token: string;
  title: string;
  icon: typeof MessageSquare;
  categories: FeedbackItem['category'][];
  showReplyEmail?: boolean;
  emptyLabel: string;
}) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/feedback`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems((data.items ?? []).filter((i: FeedbackItem) => categories.includes(i.category)));
      }
    } catch {/* noop */}
    finally { setLoading(false); }
  }, [token, categories]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try {
      await fetch(`${API}/feedback/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      setItems((prev) => prev.map((f) => f.id === id ? { ...f, read: true } : f));
    } catch {/* noop */}
  };

  const remove = async (id: string) => {
    if (!confirm('この項目を削除しますか？')) return;
    try {
      await fetch(`${API}/feedback/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      setItems((prev) => prev.filter((f) => f.id !== id));
    } catch {/* noop */}
  };

  const visible = useMemo(
    () => filter === 'unread' ? items.filter((f) => !f.read) : items,
    [items, filter]
  );
  const unreadCount = items.filter((f) => !f.read).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <HeaderIcon size={18} />
        <h2 className="text-lg font-semibold">{title}</h2>
        {unreadCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-600 text-white font-bold">
            {unreadCount}件未読
          </span>
        )}
        <button
          onClick={load}
          className="ml-auto text-xs text-gray-400 hover:text-white"
        >
          {loading ? '読込中…' : '更新'}
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        {(['unread', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'unread' ? '未読のみ' : 'すべて'}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-500 text-center py-8 text-sm">
          {filter === 'unread' ? `未読の${emptyLabel}はありません` : `${emptyLabel}はまだありません`}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              onMarkRead={markRead}
              onRemove={remove}
              showReplyEmail={showReplyEmail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackSection({ token }: { token: string }) {
  return (
    <FeedbackBaseSection
      token={token}
      title="フィードバック"
      icon={MessageSquare}
      categories={['bug', 'feature', 'other']}
      emptyLabel="フィードバック"
    />
  );
}

function SupportSection({ token }: { token: string }) {
  return (
    <FeedbackBaseSection
      token={token}
      title="サポート"
      icon={Mail}
      categories={['support']}
      showReplyEmail
      emptyLabel="サポート問い合わせ"
    />
  );
}

// 旧「投稿申請セクション」は撤廃済み — 認証済みユーザー全員が投稿可能に
// なったので承認ワークフローは不要。バックエンドの /admin/upload-applications
// 系エンドポイントも削除済み。

function classifyEndpoint(ep: string): 'cognito' | 'dynamodb' {
  if (ep.includes('/auth/')) return 'cognito';
  return 'dynamodb';
}

const SERVICE_META = {
  cognito: { label: 'AWS Cognito（認証）', icon: Key, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  dynamodb: { label: 'AWS DynamoDB（データ）', icon: Database, color: 'text-blue-400', bg: 'bg-blue-900/30' },
} as const;

function StatsSection({ stats, userCount }: { stats: Stats; userCount: number }) {
  const serviceStats = useMemo(() => {
    const result: Record<string, { total: number; endpoints: [string, number][] }> = {
      cognito: { total: 0, endpoints: [] },
      dynamodb: { total: 0, endpoints: [] },
    };
    for (const [ep, count] of stats.byEndpoint) {
      const svc = classifyEndpoint(ep);
      result[svc].total += count;
      result[svc].endpoints.push([ep, count]);
    }
    return result;
  }, [stats.byEndpoint]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={18} />
        <h2 className="text-lg font-semibold">リクエスト統計</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-400">{stats.total.toLocaleString()}</p>
          <p className="text-xs text-gray-400">総リクエスト数</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-400">{userCount}</p>
          <p className="text-xs text-gray-400">登録ユーザー数</p>
        </div>
      </div>

      <div className="space-y-3 mb-3">
        {(Object.entries(SERVICE_META) as [keyof typeof SERVICE_META, typeof SERVICE_META[keyof typeof SERVICE_META]][]).map(([key, meta]) => {
          const svc = serviceStats[key];
          const Icon = meta.icon;
          return (
            <div key={key} className={`${meta.bg} border border-gray-700 rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={meta.color} />
                <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                <span className="ml-auto text-lg font-bold text-white">{svc.total.toLocaleString()}</span>
              </div>
              {svc.endpoints.length > 0 && (
                <div className="space-y-1 mt-2">
                  {svc.endpoints.map(([ep, count]) => (
                    <div key={ep} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-2">{ep}</span>
                      <span className="text-gray-300 shrink-0">{count}回</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="bg-green-900/30 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-green-400" />
            <span className="text-sm font-semibold text-green-400">Google Maps API（地図）</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ブラウザから直接通信のため、ここでは計測不可。
            <br />Google Cloud Consoleで確認してください。
          </p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 mb-3">
        <p className="text-sm font-medium mb-2">時間帯別リクエスト数</p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {Object.entries(stats.byHour).sort(([a], [b]) => b.localeCompare(a)).map(([hour, count]) => (
            <div key={hour} className="flex justify-between text-xs">
              <span className="text-gray-400">{hour.slice(5)}時</span>
              <span className="text-blue-300">{count}回</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        サーバー起動: {new Date(stats.startedAt).toLocaleString('ja-JP')}
      </p>
    </div>
  );
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('admin_token')
  );
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<{ userId: string; nickname: string; lastSeen: number; lastSeenAgo: string }[]>([]);
  const [deletedAccounts, setDeletedAccounts] = useState<DeletedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const adminAction = useCallback(async (userId: string, action: string, method = 'POST') => {
    if (!token) return;
    setActionLoading(`${userId}-${action}`);
    try {
      const url = action === 'delete'
        ? `${API}/users/${userId}`
        : `${API}/users/${userId}/${action}`;
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert(data.message);
      const usersRes = await fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users);
      }
      // 削除アクションのときだけ削除ログも再取得（admin-issued delete 反映）
      if (action === 'delete') {
        const delRes = await fetch(`${API}/deleted-accounts`, { headers: { Authorization: `Bearer ${token}` } });
        if (delRes.ok) {
          const d = await delRes.json();
          setDeletedAccounts(d.items ?? []);
        }
      }
    } catch { alert('操作に失敗しました'); }
    finally { setActionLoading(null); }
  }, [token]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      sessionStorage.setItem('admin_token', data.token);
      setToken(data.token);
    } catch {
      setError('接続に失敗しました');
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('admin_token');
    setToken(null);
    setUsers([]);
    setDeletedAccounts([]);
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => { if (!r.ok) { handleLogout(); throw new Error(); } return r.json(); })
        .then((d) => setUsers(d.users)),
      fetch(`${API}/stats`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setStats(d)),
      fetch(`${API}/activity`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setActivity(d)),
      fetch(`${API}/deleted-accounts`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : { items: [] })
        .then((d) => setDeletedAccounts(d.items ?? [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-900 p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-center gap-2 text-white mb-2">
            <Shield size={24} />
            <h1 className="text-xl font-bold">管理者ページ</h1>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">管理者ID</label>
            <input
              value={id} onChange={(e) => setId(e.target.value)}
              className="w-full rounded-lg bg-gray-700 text-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">パスワード</label>
            <input
              type="password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-gray-700 text-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">
            ログイン
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-svh flex flex-col bg-gray-900 text-white">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Shield size={20} />
          <span className="font-bold">管理者ダッシュボード</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      <div className="p-4 space-y-6 overflow-y-auto flex-1">
        <SupportSection token={token} />
        <FeedbackSection token={token} />

        {stats && <StatsSection stats={stats} userCount={users.length} />}

        {activity.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={18} />
              <h2 className="text-lg font-semibold">最終オンライン</h2>
            </div>
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.userId} className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${a.lastSeenAgo === 'オンライン' ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <span className="font-medium text-sm">{a.nickname}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs ${a.lastSeenAgo === 'オンライン' ? 'text-green-400' : 'text-gray-400'}`}>
                      {a.lastSeenAgo}
                    </span>
                    <p className="text-[10px] text-gray-500">
                      {new Date(a.lastSeen).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} />
            <h2 className="text-lg font-semibold">ユーザー一覧</h2>
            <span className="text-sm text-gray-400">({users.length}人)</span>
          </div>

          {loading ? (
            <p className="text-gray-400">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.userId} className="bg-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{u.nickname}</span>
                    <div className="flex items-center gap-2">
                      {!u.enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">無効</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.status === 'CONFIRMED' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                      }`}>
                        {u.status === 'CONFIRMED' ? '確認済み' : '未確認'}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">{u.email}</p>
                  <p className="text-xs text-gray-500">
                    登録日: {u.createdAt ? new Date(u.createdAt).toLocaleString('ja-JP') : '-'}
                  </p>
                  <div className="flex gap-2 pt-1">
                    {u.enabled ? (
                      <button
                        onClick={() => adminAction(u.userId, 'disable')}
                        disabled={actionLoading === `${u.userId}-disable`}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900 disabled:opacity-50"
                      >
                        <Ban size={12} /> 無効化
                      </button>
                    ) : (
                      <button
                        onClick={() => adminAction(u.userId, 'enable')}
                        disabled={actionLoading === `${u.userId}-enable`}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-900/50 text-green-300 hover:bg-green-900 disabled:opacity-50"
                      >
                        <CheckCircle size={12} /> 有効化
                      </button>
                    )}
                    <button
                      onClick={() => adminAction(u.userId, 'reset-password')}
                      disabled={actionLoading === `${u.userId}-reset-password`}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-900/50 text-blue-300 hover:bg-blue-900 disabled:opacity-50"
                    >
                      <KeyRound size={12} /> PW リセット
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`${u.nickname} を削除しますか？この操作は取り消せません。`)) {
                          adminAction(u.userId, 'delete', 'DELETE');
                        }
                      }}
                      disabled={actionLoading === `${u.userId}-delete`}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-300 hover:bg-red-900 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> 削除
                    </button>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-gray-500 text-center py-8">ユーザーがいません</p>
              )}
            </div>
          )}
        </div>

        {/* 削除されたアカウント（監査ログ） */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={18} className="text-red-400" />
            <h2 className="text-lg font-semibold">削除されたアカウント</h2>
            <span className="text-sm text-gray-400">({deletedAccounts.length}件)</span>
          </div>
          {deletedAccounts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">削除履歴はありません</p>
          ) : (
            <div className="space-y-2">
              {deletedAccounts.map((d) => (
                <div key={d.userId + ':' + d.deletedAt} className="bg-gray-800 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-200">{d.nickname || '(ニックネーム未設定)'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.deletedBy === 'admin' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'
                    }`}>
                      {d.deletedBy === 'admin' ? '管理者削除' : '本人削除'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{d.email || '-'}</p>
                  <p className="text-xs text-gray-500">
                    削除日時: {new Date(d.deletedAt).toLocaleString('ja-JP')}
                  </p>
                  <p className="text-[10px] text-gray-600 font-mono break-all">{d.userId}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
