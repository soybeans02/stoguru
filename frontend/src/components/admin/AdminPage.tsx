import { useState, useEffect, useMemo, useCallback } from 'react';

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

function classifyEndpoint(ep: string): 'cognito' | 'dynamodb' {
  if (ep.includes('/auth/')) return 'cognito';
  return 'dynamodb';
}

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
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">統計</h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
          <p className="text-xs text-gray-400">総リクエスト</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{userCount}</p>
          <p className="text-xs text-gray-400">登録ユーザー</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {(['cognito', 'dynamodb'] as const).map((key) => {
          const svc = serviceStats[key];
          const label = key === 'cognito' ? 'Cognito（認証）' : 'DynamoDB（データ）';
          return (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-lg font-bold text-gray-900">{svc.total.toLocaleString()}</span>
              </div>
              {svc.endpoints.length > 0 && (
                <div className="space-y-1">
                  {svc.endpoints.map(([ep, count]) => (
                    <div key={ep} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-2">{ep}</span>
                      <span className="text-gray-500 shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-xl p-4 mb-3">
        <p className="text-sm font-medium text-gray-700 mb-2">時間帯別</p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {Object.entries(stats.byHour).sort(([a], [b]) => b.localeCompare(a)).map(([hour, count]) => (
            <div key={hour} className="flex justify-between text-xs">
              <span className="text-gray-400">{hour.slice(5)}時</span>
              <span className="text-gray-600">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        起動: {new Date(stats.startedAt).toLocaleString('ja-JP')}
      </p>
    </section>
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
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert(data.message);
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

  // Login screen
  if (!token) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-gray-900 text-center mb-6">Admin</h1>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ID</label>
            <input
              value={id} onChange={(e) => setId(e.target.value)}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-gray-50 text-gray-900 px-3 py-2.5 outline-none border border-gray-200 focus:border-gray-400 text-sm"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium">
            ログイン
          </button>
        </form>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="h-svh flex flex-col bg-white text-gray-900">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span className="font-bold text-sm">Admin</span>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600">
          ログアウト
        </button>
      </header>

      <div className="p-4 space-y-8 max-w-xl mx-auto overflow-y-auto flex-1">
        {/* Stats */}
        {stats && <StatsSection stats={stats} userCount={users.length} />}

        {/* Activity */}
        {activity.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">アクティビティ</h2>
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.userId} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${a.lastSeenAgo === 'オンライン' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium">{a.nickname}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs ${a.lastSeenAgo === 'オンライン' ? 'text-green-500' : 'text-gray-400'}`}>
                      {a.lastSeenAgo}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Users */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            ユーザー ({users.length})
          </h2>

          {loading ? (
            <p className="text-gray-400 text-sm">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.userId} className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{u.nickname}</span>
                    <div className="flex items-center gap-1.5">
                      {!u.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">無効</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        u.status === 'CONFIRMED' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                      }`}>
                        {u.status === 'CONFIRMED' ? '確認済' : '未確認'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{u.email}</p>
                  <p className="text-[10px] text-gray-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </p>
                  <div className="flex gap-1.5 pt-1">
                    {u.enabled ? (
                      <ActionBtn
                        label="無効化"
                        loading={actionLoading === `${u.userId}-disable`}
                        onClick={() => adminAction(u.userId, 'disable')}
                      />
                    ) : (
                      <ActionBtn
                        label="有効化"
                        loading={actionLoading === `${u.userId}-enable`}
                        onClick={() => adminAction(u.userId, 'enable')}
                        variant="green"
                      />
                    )}
                    <ActionBtn
                      label="PW リセット"
                      loading={actionLoading === `${u.userId}-reset-password`}
                      onClick={() => adminAction(u.userId, 'reset-password')}
                    />
                    <ActionBtn
                      label="削除"
                      loading={actionLoading === `${u.userId}-delete`}
                      onClick={() => {
                        if (confirm(`${u.nickname} を削除しますか？`)) {
                          adminAction(u.userId, 'delete', 'DELETE');
                        }
                      }}
                      variant="red"
                    />
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">ユーザーなし</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ActionBtn({ label, loading, onClick, variant }: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant?: 'red' | 'green';
}) {
  const colors = variant === 'red'
    ? 'bg-red-50 text-red-600'
    : variant === 'green'
      ? 'bg-green-50 text-green-600'
      : 'bg-gray-100 text-gray-600';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-[10px] px-2 py-1 rounded font-medium disabled:opacity-50 ${colors}`}
    >
      {label}
    </button>
  );
}
