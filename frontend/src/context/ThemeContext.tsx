import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, readStoredTheme, resolveTheme, STORAGE_KEY, type Theme, type ThemeContextValue } from './ThemeContextDef';

export type { Theme } from './ThemeContextDef';
export { useTheme } from './ThemeContextDef';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<Exclude<Theme, 'auto'>>(() => resolveTheme(readStoredTheme()));

  // 反映 (DOM 同期 + localStorage)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const resolved = resolveTheme(theme);
    if (resolved === 'black') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(STORAGE_KEY, theme);
    // resolvedTheme は別 effect で同期
    setResolvedTheme((prev) => (prev === resolved ? prev : resolved));
  }, [theme]);

  // auto 時 OS 変更追従
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = mq.matches ? 'black' : 'white';
      setResolvedTheme(resolved);
      if (resolved === 'black') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
