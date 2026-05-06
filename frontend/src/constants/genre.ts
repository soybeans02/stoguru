// マップ等の小さいフィルターパネルでは GENRES から人気を抜き出した
// この `GENRE_TAGS` を使う。完全なリストが欲しい時は data/mockRestaurants
// の `GENRES` を直接 import する。
import { GENRES } from '../data/mockRestaurants';

export const GENRE_TAGS = GENRES;
export type GenreTag = typeof GENRE_TAGS[number];
