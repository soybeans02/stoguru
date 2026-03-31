/**
 * DevTools対策 — カジュアルな覗き見を防ぐ
 * 本番環境でのみ有効化される
 */

// コンソール出力を無効化
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;
console.info = noop;
console.debug = noop;
console.table = noop;
console.dir = noop;

// 右クリック無効化
document.addEventListener('contextmenu', (e) => e.preventDefault());

// DevTools系キーボードショートカット無効化
document.addEventListener('keydown', (e) => {
  // F12
  if (e.key === 'F12') {
    e.preventDefault();
    return;
  }
  // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
  if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) {
    e.preventDefault();
    return;
  }
  // Cmd+Option+I / Cmd+Option+J / Cmd+Option+C (Mac DevTools)
  if (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(e.key)) {
    e.preventDefault();
    return;
  }
  // Ctrl+U / Cmd+U (View Source)
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    return;
  }
});
