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
  if (typeof window === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'white' || v === 'black' || v === 'wood' || v === 'auto') return v;
  // legacy: darkMode bool → black/white
  const legacy = localStorage.getItem('darkMode');
  if (legacy === 'true') return 'black';
  if (legacy === 'false') return 'white';
  return 'auto';
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
