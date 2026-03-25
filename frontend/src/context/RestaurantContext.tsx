import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import type { AppState, AppAction } from '../types/restaurant';
import { restaurantReducer } from './restaurantReducer';
import { loadState, saveState } from '../utils/storage';
import { useAuth } from './AuthContext';
import * as api from '../utils/api';

interface ContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  syncError: string | null;
}

const RestaurantContext = createContext<ContextValue | null>(null);

async function syncWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(restaurantReducer, undefined, loadState);
  const { user, token } = useAuth();
  const synced = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ログアウト時にsyncedをリセット
  useEffect(() => {
    if (!token) {
      synced.current = false;
      setSyncError(null);
    }
  }, [token]);

  // ログイン時にDBからデータを読み込み（ローカルにあってDBにないデータも同期）
  useEffect(() => {
    if (!user || !token || synced.current) return;
    synced.current = true;

    (async () => {
      try {
        const [dbRestaurants, dbSettings] = await Promise.all([
          syncWithRetry(() => api.fetchRestaurants()),
          syncWithRetry(() => api.fetchSettings()),
        ]);

        // 常にDBのデータをメインとして使用（localStorageは別ユーザーのデータの可能性あり）
        dispatch({
          type: 'LOAD_STATE',
          payload: {
            restaurants: dbRestaurants,
            categories: dbSettings.categories ?? [],
            influencers: dbSettings.influencers ?? [],
          },
        });
        setSyncError(null);
      } catch {
        setSyncError('データの同期に失敗しました。ローカルデータを表示中です。');
      }
    })();
  }, [user, token]);

  // state変更時にlocalStorage保存
  useEffect(() => {
    saveState(state);
  }, [state]);

  // dispatchをラップしてDB同期を追加（失敗時リトライ付き）
  const syncedDispatch: React.Dispatch<AppAction> = useCallback((action: AppAction) => {
    dispatch(action);

    // ログイン中のみバックエンドに同期
    if (!token) return;

    switch (action.type) {
      case 'ADD_RESTAURANT':
      case 'UPDATE_RESTAURANT':
        syncWithRetry(() => api.putRestaurant(action.payload as unknown as Record<string, unknown>))
          .catch(() => {
            setSyncError('保存の同期に失敗しました。次回起動時に再同期します。');
          });
        break;
      case 'DELETE_RESTAURANT':
        syncWithRetry(() => api.deleteRestaurant(action.payload.id))
          .catch(() => {
            setSyncError('削除の同期に失敗しました。次回起動時に再同期します。');
          });
        break;
    }
  }, [token]);

  return (
    <RestaurantContext.Provider value={{ state, dispatch: syncedDispatch, syncError }}>
      {syncError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm px-4 py-2 rounded-lg shadow">
          {syncError}
          <button onClick={() => setSyncError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurantContext(): ContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurantContext must be used inside RestaurantProvider');
  return ctx;
}
