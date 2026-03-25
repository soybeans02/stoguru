import { useState, useEffect } from 'react';
import { Shield, LogOut, Users, BarChart3 } from 'lucide-react';

const API = 'http://localhost:3001/api/admin';

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

export function AdminPage() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('admin_token')
  );
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

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
        {stats && (
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
                <p className="text-2xl font-bold text-green-400">{users.length}</p>
                <p className="text-xs text-gray-400">登録ユーザー数</p>
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
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-2">エンドポイント別（上位10）</p>
              <div className="space-y-1">
                {stats.byEndpoint.slice(0, 10).map(([endpoint, count]) => (
                  <div key={endpoint} className="flex justify-between text-xs">
                    <span className="text-gray-400 truncate mr-2">{endpoint}</span>
                    <span className="text-blue-300 shrink-0">{count}回</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              サーバー起動: {new Date(stats.startedAt).toLocaleString('ja-JP')}
            </p>
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
              <div key={u.userId} className="bg-gray-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{u.nickname}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.status === 'CONFIRMED' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                  }`}>
                    {u.status === 'CONFIRMED' ? '確認済み' : '未確認'}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{u.email}</p>
                <p className="text-xs text-gray-500">
                  登録日: {u.createdAt ? new Date(u.createdAt).toLocaleString('ja-JP') : '-'}
                </p>
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
