/**
 * 軽量自前 i18n。
 * - 外部ライブラリなし
 * - `t('account.editProfile')` のようなドット記法
 * - 言語切替は LanguageContext で管理 (永続: localStorage `app.language`)
 */
import { ja } from './ja';
import { en } from './en';

export type Language = 'ja' | 'en';
export const STORAGE_KEY = 'app.language';

export const dictionaries = { ja, en } as const;

type DotPaths<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${DotPaths<T[K]>}`
      : never
  : never;

export type TranslationKey = DotPaths<typeof ja>;

export function getTranslation(lang: Language, key: string, fallback?: string): string {
  const dict = dictionaries[lang] ?? dictionaries.ja;
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = dict;
  for (const p of parts) {
    if (cur == null) return fallback ?? key;
    cur = cur[p];
  }
  if (typeof cur === 'string') return cur;
  // 言語に無いキーは ja を試す
  if (lang !== 'ja') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jaCur: any = ja;
    for (const p of parts) {
      if (jaCur == null) break;
      jaCur = jaCur[p];
    }
    if (typeof jaCur === 'string') return jaCur;
  }
  return fallback ?? key;
}

export function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ja';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ja' || stored === 'en') return stored;
  const nav = navigator.language?.toLowerCase() ?? '';
  if (nav.startsWith('ja')) return 'ja';
  return 'ja'; // デフォルトは日本語 (主要ユーザーが日本)
}
