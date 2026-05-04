/**
 * シンプルな SPA ナビゲーションヘルパー。
 * URL を pushState で変えつつ popstate を発火して、App.tsx の useRoute*
 * フックが再評価するように仕向ける。
 */
export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
