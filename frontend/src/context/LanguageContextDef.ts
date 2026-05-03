import { createContext, useContext } from 'react';
import { getTranslation, type Language } from '../i18n';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  /** 翻訳取得関数 */
  t: (key: string, fallback?: string) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: 'ja',
      setLanguage: () => {},
      t: (key: string, fallback?: string) => getTranslation('ja', key, fallback),
    };
  }
  return ctx;
}
