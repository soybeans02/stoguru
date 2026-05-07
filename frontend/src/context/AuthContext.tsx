import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { setRefreshTokenFn } from '../utils/api';

const API = (import.meta.env.VITE_API_URL ?? '/api') + '/auth';

interface User {
  userId: string;
  email: string;
  nickname: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signUp: (email: string, password: string, nickname: string) => Promise<{ needConfirm: boolean }>;
  confirm: (email: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  updateNickname: (nickname: string) => void;
  updateEmail: (email: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(!!localStorage.getItem('accessToken'));
  // bootstrap effect 内で自前 setToken した時に effect を再走させないための
  // ガード。外部 (login / logout) から token が変わった時だけ再 bootstrap する。
  const internalTokenSetRef = useRef(false);

  // ─── 自動ログイン ───
  // トークン取得元の優先度:
  //   1. httpOnly cookie（バックがログイン時に Set-Cookie で発行する。
  //      JS から見えないので XSS でも盗めない）
  //   2. localStorage（旧フロー / iOS WebView 等の互換用 fallback）
  // どちらも /me が 200 なら認証済み扱い。
  // 401 が返ってきた場合は refreshToken で再発行を試みる。
  // 旧版は 401 即 logout していたため、accessToken の TTL（Cognito 既定 1h）が
  // 切れてからリロードすると毎回ログアウトされる事故が起きていた。
  useEffect(() => {
    // 自前 setToken (refresh 成功時) で来た再走はスキップ。
    // 外部からの token 変更 (login / logout) のみで bootstrap し直す。
    if (internalTokenSetRef.current) {
      internalTokenSetRef.current = false;
      return;
    }
    let cancelled = false;
    const tryFetchMe = async (bearer: string | null): Promise<Response> => {
      return fetch(`${API}/me`, {
        credentials: 'include',
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      });
    };
    const tryRefresh = async (): Promise<string | null> => {
      const rt = localStorage.getItem('refreshToken');
      if (!rt) return null;
      try {
        const r = await fetch(`${API}/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!r.ok) return null;
        const data = await r.json().catch(() => null) as { accessToken?: string } | null;
        if (data?.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          return data.accessToken;
        }
        return null;
      } catch {
        return null;
      }
    };

    (async () => {
      try {
        let res = await tryFetchMe(token);
        if (cancelled) return;
        if (!res.ok && res.status === 401) {
          // accessToken 期限切れの可能性 → refresh を試行
          const newToken = await tryRefresh();
          if (cancelled) return;
          if (newToken) {
            res = await tryFetchMe(newToken);
            if (cancelled) return;
            if (res.ok) {
              const u = await res.json();
              setUser(u);
              // setToken の再走を防ぐためフラグを立ててから set。
              internalTokenSetRef.current = true;
              setToken(newToken);
              return;
            }
          }
          // refresh も無理 → ログアウト扱い
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setToken(null);
          return;
        }
        if (res.ok) {
          const u = await res.json();
          setUser(u);
        } else {
          // 5xx 等 → token は触らずネットワークエラー扱い
        }
      } catch {
        // ネットワークエラーは tolerable（再試行は次回マウント時）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function signUp(email: string, password: string, nickname: string) {
    const res = await fetch(`${API}/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, nickname }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    return { needConfirm: true };
  }

  async function confirm(email: string, code: string) {
    const res = await fetch(`${API}/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      credentials: 'include', // バックが Set-Cookie を返すので必須
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    const data = await res.json();
    // 旧フロー互換: access/refresh を localStorage にも保存。新フローでは
    // cookie が真の保管場所だが、refresh エンドポイントは現状 refreshToken を
    // body で要求するので localStorage にも保持しておく必要がある。
    // 将来 refresh も cookie ベースに移行したら localStorage 利用は完全削除可。
    if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    setToken(data.accessToken ?? null);
  }

  async function forgotPassword(email: string) {
    const res = await fetch(`${API}/forgot-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
  }

  async function resetPassword(email: string, code: string, newPassword: string) {
    const res = await fetch(`${API}/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
  }

  function updateNicknameLocal(nickname: string) {
    setUser((prev) => prev ? { ...prev, nickname } : prev);
  }

  function updateEmailLocal(email: string) {
    setUser((prev) => prev ? { ...prev, email } : prev);
  }

  async function logout() {
    // バックの cookie も削除してもらう（fire-and-forget で OK）
    try {
      await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // 前ユーザーの個人情報キャッシュも全部消す。
    // これを忘れるとゲストに戻ったあとも左下サイドバーに前ユーザーの
    // プロフィール写真等が出てしまう。
    [
      'cache:profileImage',
      'cache:profileIcon',
      'cache:coverImage',
      'cache:userRole',
      'cache:isPrivate',
      'cache:followingCount',
      'cache:followersCount',
      'cache:pushNotif',
      'cache:emailNotif',
      'cache:favoriteGenre',
      'cache:region',
    ].forEach((k) => localStorage.removeItem(k));
    setToken(null);
    setUser(null);
  }

  const refreshTokenFn = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return null;
    try {
      const res = await fetch(`${API}/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        logout();
        return null;
      }
      const data = await res.json();
      if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
      setToken(data.accessToken ?? null);
      return data.accessToken ?? null;
    } catch {
      return null;
    }
  }, []);

  // api.ts に refreshToken 関数を登録。
  // 旧版は refreshTokenFn 宣言より前に書かれていて、deps も [] だったため
  // ホットリロード / 多重 mount 時に古い closure (古い logout を抱える) が
  // api.ts に残る恐れがあった。宣言後に移動 + deps に refreshTokenFn を含める。
  useEffect(() => {
    setRefreshTokenFn(refreshTokenFn);
  }, [refreshTokenFn]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signUp, confirm, login, logout, refreshToken: refreshTokenFn, forgotPassword, resetPassword, updateNickname: updateNicknameLocal, updateEmail: updateEmailLocal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
