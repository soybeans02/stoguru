import type { AppState } from '../types/restaurant';

const KEY = 'restaurant_bookmark_v1';

const defaultState: AppState = {
  restaurants: [],
  categories: [],
  influencers: [],
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState;
    return JSON.parse(raw) as AppState;
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage quota exceeded — ignore
  }
}
