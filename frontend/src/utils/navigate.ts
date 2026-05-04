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

/**
 * ブラウザ履歴を 1 つ戻る。履歴が無い（直リンク等）場合はホームへ。
 */
export function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate('/');
  }
}
