import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { setRefreshTokenFn } from '../utils/api';

const API = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api') + '/auth';

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(!!localStorage.getItem('accessToken'));

  // トークンがあれば自動ログイン
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u) => setUser(u))
      .catch(() => { localStorage.removeItem('accessToken'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  async function signUp(email: string, password: string, nickname: string) {
    const res = await fetch(`${API}/signup`, {
      method: 'POST',
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    setToken(data.accessToken);
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setToken(null);
    setUser(null);
  }

  // api.tsにrefreshToken関数を登録
  useEffect(() => {
    setRefreshTokenFn(refreshTokenFn);
  }, []);

  const refreshTokenFn = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return null;
    try {
      const res = await fetch(`${API}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        logout();
        return null;
      }
      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      setToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, signUp, confirm, login, logout, refreshToken: refreshTokenFn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
