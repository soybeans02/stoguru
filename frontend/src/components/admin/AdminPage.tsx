import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, LogOut, Users, BarChart3, Database, Key, Bot, MapPin, Activity, Ban, CheckCircle, KeyRound, Trash2 } from 'lucide-react';

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

function classifyEndpoint(ep: string): 'cognito' | 'dynamodb' | 'anthropic' | 'other' {
  if (ep.includes('/auth/')) return 'cognito';
  if (ep.includes('/extract-url')) return 'anthropic';
  return 'dynamodb';
}

const SERVICE_META = {
  cognito: { label: 'AWS Cognito（認証）', icon: Key, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  dynamodb: { label: 'AWS DynamoDB（データ）', icon: Database, color: 'text-blue-400', bg: 'bg-blue-900/30' },
  anthropic: { label: 'Anthropic API（AI解析）', icon: Bot, color: 'text-purple-400', bg: 'bg-purple-900/30' },
} as const;

function StatsSection({ stats, userCount }: { stats: Stats; userCount: number }) {
  const serviceStats = useMemo(() => {
    const result: Record<string, { total: number; endpoints: [string, number][] }> = {
      cognito: { total: 0, endpoints: [] },
      dynamodb: { total: 0, endpoints: [] },
      anthropic: { total: 0, endpoints: [] },
    };
    for (const [ep, count] of stats.byEndpoint) {
      const svc = classifyEndpoint(ep);
      if (svc === 'other') continue;
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

      {/* 概要カード */}
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

      {/* サービス別内訳 */}
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

        {/* Google Maps（バックエンド経由しない） */}
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

      {/* 時間帯別 */}
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
        method: method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert(data.message);
      // Reload users
      const usersRes = await fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users);
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
    <div className="min-h-svh bg-gray-900 text-white">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Shield size={20} />
          <span className="font-bold">管理者ダッシュボード</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      <div className="p-4 space-y-6">
        {/* リクエスト統計 */}
        {stats && <StatsSection stats={stats} userCount={users.length} />}

        {/* ユーザーアクティビティ */}
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

        <div className="flex items-center gap-2 mb-4">
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
    </div>
  );
}
