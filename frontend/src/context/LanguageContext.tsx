import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectInitialLanguage, getTranslation, STORAGE_KEY, type Language } from '../i18n';
import { LanguageContext, type LanguageContextValue } from './LanguageContextDef';

export { useTranslation } from './LanguageContextDef';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((l: Language) => setLanguageState(l), []);
  const t = useCallback(
    (key: string, fallback?: string) => getTranslation(language, key, fallback),
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
