import { createContext, useContext } from 'react';

export type Theme = 'white' | 'black' | 'wood' | 'auto';

export const STORAGE_KEY = 'app.theme';

export interface ThemeContextValue {
  theme: Theme;
  /** auto を解決した実テーマ (white | black | wood) */
  resolvedTheme: Exclude<Theme, 'auto'>;
  setTheme: (t: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function readStoredTheme(): Theme {
  // web 版は 'white' / 'black' のみ UI で選択可能。
  // 旧 'wood' / 'auto' を保存していたユーザーは black 寄りに丸める
  // （'auto' は OS 設定に従って解決、'wood' は暗色寄りなので black）。
  if (typeof window === 'undefined') return 'white';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'white' || v === 'black') return v;
  if (v === 'wood') return 'black';
  if (v === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white';
  }
  // legacy: darkMode bool → black/white
  const legacy = localStorage.getItem('darkMode');
  if (legacy === 'true') return 'black';
  if (legacy === 'false') return 'white';
  // 初期値は OS 設定で自動判別（一度だけ。以降は localStorage に固定値が入る）
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white';
}

export function resolveTheme(theme: Theme): Exclude<Theme, 'auto'> {
  if (theme !== 'auto') return theme;
  if (typeof window === 'undefined') return 'white';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white';
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'auto',
      resolvedTheme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white',
      setTheme: () => {},
    };
  }
  return ctx;
}
