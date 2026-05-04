/**
 * 特集記事データ
 *
 * ─── 新しい記事を追加する手順 ───
 * 1. 下の `FEATURES` 配列に新しいエントリを追加（slug を一意に）
 * 2. 必要なら `themeConfigs`（DiscoveryHome.tsx）の該当 theme に
 *    featureSlug を追加して、ホームのカードと記事を紐付け
 * 3. それだけ。/features/{slug} で自動的に記事ページが表示される
 *
 * ─── 各フィールドの書き方 ───
 * - slug: URL に使う英小文字 + ハイフン（例: 'late-night-bars'）
 * - tag: ヒーローに大きく出る「FEATURE · 特集」みたいな短文
 * - title: 記事タイトル（句読点 OK、改行不要）
 * - subtitle: ヒーロー下に出る 1〜2 行の要約
 * - heroImage: 高品質の横長画像 URL（Unsplash &q=85 推奨）
 * - intro: 本文上部の段落配列。リード文 + 通常段落を続ける
 * - pullQuote: 中央に大きく出す引用（任意）
 * - body: pullQuote の後の段落（任意）
 * - entries: 紹介する店の配列。各店に写真・コメント・情報・タグ
 * - closingCTA: 末尾のオレンジボタンの文言
 * - relatedSlugs: 関連記事の slug 配列（最大 3 つ表示）
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
   記事データ
   ═══════════════════════════════════════════════════════════════ */

export const FEATURES: FeatureArticle[] = [
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

export function findFeature(slug: string): FeatureArticle | null {
  return FEATURES.find((f) => f.slug === slug) ?? null;
}

export function findRelated(slugs?: string[]): FeatureArticle[] {
  if (!slugs || slugs.length === 0) return [];
  return slugs
    .map((s) => FEATURES.find((f) => f.slug === s))
    .filter((f): f is FeatureArticle => !!f);
}
