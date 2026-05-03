import { useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * 既存コンポーネント互換のためのラッパー。新規コードは `useTheme` を使うこと。
 * - isDark: 現在解決済みテーマが black なら true
 * - toggle: black <-> white を切り替える
 */
export function useDarkMode() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'black';
  const toggle = useCallback(() => {
    setTheme(isDark ? 'white' : 'black');
  }, [isDark, setTheme]);
  return { isDark, toggle };
}
