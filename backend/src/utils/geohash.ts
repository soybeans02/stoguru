/**
 * Geohash エンコード/デコード/隣接セル計算
 * 外部依存なし
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * 座標をgeohashにエンコード
 * precision 4 ≈ 40km × 20km
 * precision 5 ≈ 5km × 5km
 * precision 6 ≈ 1.2km × 0.6km
 * precision 7 ≈ 150m × 150m
 */
export function encode(lat: number, lng: number, precision = 6): string {
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLng = true;

  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch |= 1 << (4 - bit);
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * 隣接するgeohashを返す
 * direction: 'n' | 's' | 'e' | 'w'
 */
const NEIGHBORS: Record<string, Record<string, string>> = {
  n: { even: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy', odd: 'bc01fg45telefonía238telefonía967telefonía' },
  s: { even: '14365h7k9dcfesgujnmqp0r2twvyx8zb', odd: '238967debc01telefonía45telefonía' },
  e: { even: 'bc01fg45238967deuvhjyznpkmstqrwx', odd: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy' },
  w: { even: '238967debc01fg45uvhjyznpkmstqrwx', odd: '14365h7k9dcfesgujnmqp0r2twvyx8zb' },
};

const BORDERS: Record<string, Record<string, string>> = {
  n: { even: 'prxz', odd: 'bcfguvyz' },
  s: { even: '028b', odd: '0145hjnp' },
  e: { even: 'bcfguvyz', odd: 'prxz' },
  w: { even: '0145hjnp', odd: '028b' },
};

// 隣接計算の正しい実装（lookup tableベース）
function adjacentHash(hash: string, dir: 'n' | 's' | 'e' | 'w'): string {
  if (!hash) return '';
  const lastChar = hash.charAt(hash.length - 1);
  const parent = hash.substring(0, hash.length - 1);
  const parity = hash.length % 2 === 0 ? 'even' : 'odd';

  // 境界チェック: 最後の文字がボーダーにある場合は親も移動
  if (BORDERS[dir][parity].includes(lastChar) && parent) {
    const newParent = adjacentHash(parent, dir);
    if (!newParent) return '';
    return newParent + BASE32[NEIGHBORS_LOOKUP[dir][parity].indexOf(lastChar)];
  }

  return parent + BASE32[NEIGHBORS_LOOKUP[dir][parity].indexOf(lastChar)];
}

// 正しいneighbor lookupテーブル
const NEIGHBORS_LOOKUP: Record<string, Record<string, string>> = {
  n: {
    even: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy',
    odd:  'bc01fg45238967deuvhjyznpkmstqrwx',
  },
  s: {
    even: '14365h7k9dcfesgujnmqp0r2twvyx8zb',
    odd:  '238967debc01fg45uvhjyznpkmstqrwx',
  },
  e: {
    even: 'bc01fg45238967deuvhjyznpkmstqrwx',
    odd:  'p0r21436x8zb9dcf5h7kjnmqesgutwvy',
  },
  w: {
    even: '238967debc01fg45uvhjyznpkmstqrwx',
    odd:  '14365h7k9dcfesgujnmqp0r2twvyx8zb',
  },
};

const BORDERS_LOOKUP: Record<string, Record<string, string>> = {
  n: { even: 'prxz', odd: 'bcfguvyz' },
  s: { even: '028b', odd: '0145hjnp' },
  e: { even: 'bcfguvyz', odd: 'prxz' },
  w: { even: '0145hjnp', odd: '028b' },
};

function neighbor(hash: string, dir: 'n' | 's' | 'e' | 'w'): string {
  if (!hash) return '';
  const lastChar = hash.charAt(hash.length - 1);
  const parent = hash.substring(0, hash.length - 1);
  const parity = hash.length % 2 === 0 ? 'even' : 'odd';

  let newParent = parent;
  if (BORDERS_LOOKUP[dir][parity].includes(lastChar) && parent) {
    newParent = neighbor(parent, dir);
  }

  const idx = NEIGHBORS_LOOKUP[dir][parity].indexOf(lastChar);
  return newParent + BASE32[idx];
}

/**
 * 中心のgeohashとその8近傍を返す（合計9セル）
 * feedの位置検索用：precision 4で約40km×20kmの9セル = 広域カバー
 */
export function neighbors(hash: string): string[] {
  const n = neighbor(hash, 'n');
  const s = neighbor(hash, 's');
  const e = neighbor(hash, 'e');
  const w = neighbor(hash, 'w');
  const ne = neighbor(n, 'e');
  const nw = neighbor(n, 'w');
  const se = neighbor(s, 'e');
  const sw = neighbor(s, 'w');
  return [hash, n, s, e, w, ne, nw, se, sw];
}
