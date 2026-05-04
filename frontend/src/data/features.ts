/**
 * 特集記事データ
 *
 * 仕組み: バックエンド経由で microCMS から取得（プライマリ）+ 下の
 * FALLBACK_FEATURES 配列（CMS が空 or 未設定時のフォールバック）
 *
 * ─── 新しい記事を追加する手順 ───
 * A. microCMS で書く場合（推奨）
 *    1. microCMS の管理画面 → コンテンツ →「特集」→「+ 追加」
 *    2. フィールドを埋めて公開ボタン
 *    3. 5 分以内にサイトに反映（バックエンドキャッシュの TTL）
 *
 * B. ローカルにハードコードする場合（CMS 触らない場合）
 *    1. 下の FALLBACK_FEATURES 配列にエントリ追加（slug を一意に）
 *    2. git push → デプロイ
 *    3. /features/{slug} で表示
 */

export interface FeatureEntry {
  number: string;              // "01" 等の表示用文字列
  name: string;
  location: string;            // "大阪 · 北新地"
  genre: string;               // "オーセンティックバー"
  hours: string;               // "営業 19:00 – 5:00"
  photo: string;
  comment: string[];           // 段落の配列
  info: {
    price: string;             // "¥3,000〜¥5,000"
    access: string;            // "北新地駅 3 分"
    seats: string;             // "カウンター 8 / テーブル 4"
    reservation: string;       // "推奨" / "不可" / "夜のみ可"
  };
  tags: string[];
  /** DB 上のレストランと紐付ける場合に指定。あれば「保存する」が機能する */
  restaurantId?: string;
}

export interface FeatureArticle {
  slug: string;
  tag: string;
  title: string;
  subtitle: string;
  heroImage: string;
  /** ホームのテーマカードに使う画像（省略時は heroImage） */
  cardImage?: string;
  author: { name: string; initial: string };
  date: string;
  readMinutes: number;
  location?: string;
  intro: string[];
  pullQuote?: string;
  body?: string[];
  entries: FeatureEntry[];
  closingCTA: string;
  relatedSlugs?: string[];
}

/* ═══════════════════════════════════════════════════════════════
   フォールバック記事データ（CMS が空 or 未設定なら使われる）
   ═══════════════════════════════════════════════════════════════ */

export const FALLBACK_FEATURES: FeatureArticle[] = [
  {
    slug: 'late-night-bars',
    tag: 'FEATURE · 特集',
    title: '深夜まで営業する隠れバー、12 選。',
    subtitle:
      '終電を逃した夜、もう一杯だけ。地元客に愛され、観光ガイドには載らない、25 時以降も扉を開けてる大阪・梅田のバーを編集部が厳選。',
    heroImage: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=1600&q=85',
    cardImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=85',
    author: { name: 'stoguru 編集部', initial: '編' },
    date: '2026年5月4日',
    readMinutes: 8,
    location: '大阪・梅田',
    intro: [
      '24 時を過ぎると、街は別の顔を見せる。観光客が引いて、店の灯りも半分以下。そんな時間に、まだ静かに開いてる扉がある。今回は深夜営業を続ける、地元の常連たちが愛するバーを 12 軒、編集部が実際に飲み歩いて選んだ。',
      '「深夜営業」と一口に言っても色んなタイプがある。終電後の会社員が立ち寄る一杯系、朝までジン一辺倒のオーセンティック、ラーメンと同居するカジュアルな立ち飲み。今回ピックしたのは、その「店主の人柄」が滲み出ている店ばかり。一人で行っても話しかけられすぎず、でも常連と隣り合えば自然と会話が生まれる、ちょうどいい空気感。',
    ],
    pullQuote: '深夜のバーは「もう一軒」じゃない。1 軒目に来ても、その店だけで完結する。',
    body: [
      '値段帯は 1 杯 ¥800〜¥1,800 程度。最初の 1 杯は店主のおすすめを聞くのが間違いない。ジントニックやハイボールなら、その店の質がそのまま出る。',
    ],
    entries: [
      {
        number: '01',
        name: 'Bar 月光',
        location: '大阪 · 北新地',
        genre: 'オーセンティックバー',
        hours: '営業 19:00 – 5:00',
        photo: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=85',
        comment: [
          '北新地のビルの地下、看板も控えめな扉を開けると、コの字のカウンターとマスター・小林さん。1972 年生まれのこの店は、二代目が継いでもう 8 年。',
          '「最初の 1 杯はジン、二杯目はウイスキー、三杯目は気分で」というルールが常連の中だけにある。ジントニックの氷ひとつにかける時間が見ていて気持ちいい。2 時を過ぎると常連同士の小声の会話が混じって、店の温度がじんわり上がる。',
        ],
        info: { price: '¥3,000〜¥5,000', access: '北新地駅 3 分', seats: 'カウンター 8 / テーブル 4', reservation: '推奨' },
        tags: ['バー', '深夜営業', 'ジン', 'カウンター'],
      },
      {
        number: '02',
        name: '立ち呑み 三日月',
        location: '大阪 · 西梅田',
        genre: '立ち飲みバー',
        hours: '営業 17:00 – 4:00',
        photo: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1200&q=85',
        comment: [
          'オーセンティックの対極。ガード下、5 坪、立ち飲み。それでも 25 時を過ぎる頃には近所の店主たちが「上がり」で集まってくる、夜の終着点みたいな店。',
          'オススメはハイボール ¥500 と、隣の中華屋から取り寄せる焼売 ¥400。「うちはツマミは外注ですから」と笑う店主・橋本さんの飄々とした感じがこの店の空気を作ってる。一人客率 8 割。',
        ],
        info: { price: '¥1,500〜¥2,500', access: '西梅田駅 1 分', seats: '立ち飲み 12 名', reservation: '不可' },
        tags: ['立ち飲み', '深夜営業', 'ひとり飲み', '¥500 ハイボール'],
      },
      {
        number: '03',
        name: 'Coffee & Bar 黒猫',
        location: '大阪 · 中崎町',
        genre: 'カフェバー',
        hours: '営業 14:00 – 3:00',
        photo: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=1200&q=85',
        comment: [
          '昼はコーヒー、夜はバー。中崎町の路地裏、築 70 年の長屋を改装した一軒。オーナー田中さんは元バリスタ・元バーテンダーの異色の経歴。',
          '深夜は本を読みに来る客が多い。BGM はジャズで、明かりは絞られている。コーヒーカクテル「黒猫」¥900 がこの店の代名詞。エスプレッソとカルーア、その上に薄く浮かぶクリーム。三度目に注文するとマスターが少し笑う。',
        ],
        info: { price: '¥2,000〜¥3,500', access: '中崎町駅 4 分', seats: 'カウンター 6 / 小上がり 4', reservation: '夜のみ可' },
        tags: ['カフェバー', '深夜営業', '読書', '古民家'],
      },
    ],
    closingCTA: '紹介した店をすべて保存',
    relatedSlugs: ['date-night-spots', 'cheap-lunch-hits'],
  },

  {
    slug: 'date-night-spots',
    tag: 'DATE · デート',
    title: '夜景が綺麗な、デート向き 8 軒。',
    subtitle: '記念日でもいつでも。窓側の席を予約して、二人で乾杯したい大阪のレストラン。',
    heroImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=85',
    cardImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=85',
    author: { name: 'stoguru 編集部', initial: '編' },
    date: '2026年5月4日',
    readMinutes: 6,
    location: '大阪',
    intro: [
      'デートの店選びって、地味に難しい。雰囲気・予算・アクセス・予約の取りやすさ、その全部を満たした上で「相手が喜ぶ」が要る。今回は窓側の席を取れば外れない、編集部おすすめのデートスポットを 8 軒。',
    ],
    body: [
      '記念日の 1 軒目、サプライズの締め、付き合って初めてのちゃんとしたディナー — 用途別にコメント書いてるので、シーンに合わせて選んでみて。',
    ],
    entries: [
      {
        number: '01',
        name: 'Italian Roof Garden',
        location: '大阪 · 心斎橋',
        genre: 'イタリアン',
        hours: '営業 18:00 – 23:00',
        photo: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=85',
        comment: [
          'ホテルの 24 階、屋外テラスから見下ろす道頓堀の夜景。シェフ・坂本さんは 10 年ローマ修行帰り。',
          '記念日プランは ¥9,800 のコースに花束 + 撮影サービス込み。彼女が写真好きなら鉄板。事前にメニュー要望伝えればアレルギー対応も柔軟。',
        ],
        info: { price: '¥8,000〜¥15,000', access: '心斎橋駅 5 分', seats: 'テラス 16 / ホール 30', reservation: '必須' },
        tags: ['イタリアン', '記念日', '夜景', 'テラス'],
      },
      {
        number: '02',
        name: '鉄板 蛍火',
        location: '大阪 · 福島',
        genre: '鉄板焼き',
        hours: '営業 17:30 – 22:30',
        photo: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=85',
        comment: [
          'カウンター 6 席のみ。鉄板の前で焼かれる神戸牛を 30cm の距離で見られる、ライブ感が魅力。',
          'シェフが寡黙なタイプなので、二人の会話メインで進む。シャンパン・赤ワインが充実、ペアリング ¥4,000 アリ。',
        ],
        info: { price: '¥12,000〜¥18,000', access: '福島駅 2 分', seats: 'カウンター 6', reservation: '必須' },
        tags: ['鉄板焼き', '神戸牛', 'カウンター', '記念日'],
      },
    ],
    closingCTA: 'デート向きスポットを保存',
    relatedSlugs: ['late-night-bars', 'special-occasion'],
  },

  {
    slug: 'cheap-lunch-hits',
    tag: 'LUNCH · ランチ',
    title: 'ランチ ¥1,000 以下、ヒット 10 選。',
    subtitle: 'コスパだけじゃない、満足感もちゃんと高いお昼ご飯。オフィスワーカーの味方。',
    heroImage: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1600&q=85',
    cardImage: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=85',
    author: { name: 'stoguru 編集部', initial: '編' },
    date: '2026年5月4日',
    readMinutes: 5,
    location: '大阪・梅田周辺',
    intro: [
      '物価が上がる中、¥1,000 以下のランチで「ちゃんと美味い」店は減ってる。それでも梅田・中之島周辺には、平日のサラリーマンが行列を作るヒット店がまだまだある。',
      '今回は値段だけじゃなく、味・量・スピード（昼休み 1 時間で完結できるか）の 3 軸で評価。',
    ],
    entries: [
      {
        number: '01',
        name: '中華そば 一徹',
        location: '大阪 · 北新地',
        genre: 'ラーメン',
        hours: '営業 11:00 – 14:30',
        photo: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=1200&q=85',
        comment: [
          '昼のみ営業のラーメン店。中華そば ¥780 + ライス無料の、シンプルに鬼コスパな一杯。',
          '醤油ベースの透明スープに、自家製平打ち麺。チャーシュー 2 枚が薄切り 6 枚に増量される「お昼サービス」が地味に嬉しい。',
        ],
        info: { price: '¥780〜¥1,000', access: '北新地駅 2 分', seats: 'カウンター 10 / テーブル 8', reservation: '不可' },
        tags: ['ラーメン', 'ランチ', 'コスパ', '行列'],
      },
    ],
    closingCTA: 'ランチヒット店を保存',
    relatedSlugs: ['late-night-bars', 'date-night-spots'],
  },
];

/* ═══════════════════════════════════════════════════════════════
   非同期取得：microCMS + フォールバックをマージ
   ═══════════════════════════════════════════════════════════════ */

import { fetchFeaturesFromCMS } from '../utils/api';

let featuresPromise: Promise<FeatureArticle[]> | null = null;

/** microCMS のレスポンスを FeatureArticle 形に正規化 */
function normalizeCMSFeature(raw: Record<string, unknown>): FeatureArticle | null {
  const slug = typeof raw.slug === 'string' ? raw.slug : null;
  const title = typeof raw.title === 'string' ? raw.title : null;
  if (!slug || !title) return null;

  // microCMS の画像フィールドは { url, height, width } の形
  const imgUrl = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'url' in v) return String((v as { url: unknown }).url ?? '');
    return '';
  };

  // 繰り返しフィールドは配列。CMS 上のフィールド ID 揺れに耐性を持たせる
  const arrayOf = <T>(v: unknown, mapper: (item: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(v)) return [];
    return v.map((it) => mapper(it as Record<string, unknown>)).filter((x): x is T => x !== null);
  };

  return {
    slug,
    tag: String(raw.tag ?? ''),
    title,
    subtitle: String(raw.subtitle ?? ''),
    heroImage: imgUrl(raw.heroImage),
    cardImage: imgUrl(raw.cardImage) || undefined,
    author: {
      name: String(raw.authorName ?? 'stoguru 編集部'),
      initial: String(raw.authorInitial ?? '編'),
    },
    date: String(raw.date ?? ''),
    readMinutes: typeof raw.readMinutes === 'number' ? raw.readMinutes : 5,
    location: raw.location ? String(raw.location) : undefined,
    intro: arrayOf<string>(raw.intro, (it) => typeof it.text === 'string' ? it.text : null),
    pullQuote: raw.pullQuote ? String(raw.pullQuote) : undefined,
    body: arrayOf<string>(raw.body, (it) => typeof it.text === 'string' ? it.text : null),
    entries: arrayOf<FeatureEntry>(raw.entries, (it) => {
      const name = typeof it.name === 'string' ? it.name : null;
      if (!name) return null;
      return {
        number: String(it.number ?? ''),
        name,
        location: String(it.location ?? ''),
        genre: String(it.genre ?? ''),
        hours: String(it.hours ?? ''),
        photo: imgUrl(it.photo),
        comment: arrayOf<string>(it.comment, (c) => typeof c.text === 'string' ? c.text : null),
        info: {
          price: String(it.price ?? ''),
          access: String(it.access ?? ''),
          seats: String(it.seats ?? ''),
          reservation: String(it.reservation ?? ''),
        },
        tags: arrayOf<string>(it.tags, (c) => typeof c.text === 'string' ? c.text : null),
        restaurantId: it.restaurantId ? String(it.restaurantId) : undefined,
      };
    }),
    closingCTA: String(raw.closingCTA ?? '紹介した店をすべて保存'),
    relatedSlugs: arrayOf<string>(raw.relatedSlugs, (it) => typeof it.slug === 'string' ? it.slug : null),
  };
}

/** 全記事を取得：CMS 優先、失敗時は FALLBACK にマージダウン */
export async function loadAllFeatures(): Promise<FeatureArticle[]> {
  if (!featuresPromise) {
    featuresPromise = (async () => {
      const cmsRaw = await fetchFeaturesFromCMS();
      const cmsArticles = cmsRaw
        .map((r) => normalizeCMSFeature(r as Record<string, unknown>))
        .filter((a): a is FeatureArticle => a !== null);
      // CMS にあるものを優先、無い slug は FALLBACK で補完
      const cmsSlugs = new Set(cmsArticles.map((a) => a.slug));
      const merged = [
        ...cmsArticles,
        ...FALLBACK_FEATURES.filter((f) => !cmsSlugs.has(f.slug)),
      ];
      return merged;
    })();
  }
  return featuresPromise;
}

export async function findFeature(slug: string): Promise<FeatureArticle | null> {
  const all = await loadAllFeatures();
  return all.find((f) => f.slug === slug) ?? null;
}

export async function findRelated(slugs?: string[]): Promise<FeatureArticle[]> {
  if (!slugs || slugs.length === 0) return [];
  const all = await loadAllFeatures();
  return slugs
    .map((s) => all.find((f) => f.slug === s))
    .filter((f): f is FeatureArticle => !!f);
}

/** テスト・デバッグ用 */
export function _resetFeaturesCache() {
  featuresPromise = null;
}
