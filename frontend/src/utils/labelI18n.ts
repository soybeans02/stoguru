/**
 * mockRestaurants.ts に定義された JP データラベル (ジャンル / シーン /
 * 都道府県) を Language に応じて表示用文字列に変換するヘルパー。
 *
 * データそのものを多言語化すると backend / フィルタロジック / 既存ストックの
 * genre 文字列 が連動して破綻するため、内部キーは常に JP のまま保持し、
 * **表示するときだけ** ロケール写像を引いて切り替える方針。
 *
 * 英訳が無いキーはそのまま JP を返す (フォールバック)。
 */
import type { Language } from '../i18n';
import { romanizeProperNoun } from './romaji';

const GENRE_EN: Record<string, string> = {
  // 人気 8
  'ラーメン': 'Ramen',
  '寿司': 'Sushi',
  '焼肉': 'BBQ / Yakiniku',
  '居酒屋': 'Izakaya',
  'イタリアン': 'Italian',
  'カフェ': 'Cafe',
  '中華': 'Chinese',
  '韓国料理': 'Korean',
  // 和食まわり
  '和食': 'Japanese',
  '海鮮・魚介': 'Seafood',
  '天ぷら': 'Tempura',
  'とんかつ': 'Tonkatsu',
  '焼き鳥': 'Yakitori',
  'うなぎ': 'Eel',
  'しゃぶしゃぶ': 'Shabu-shabu',
  'すき焼き': 'Sukiyaki',
  '鍋': 'Hot pot',
  // 麺
  'うどん': 'Udon',
  'そば': 'Soba',
  // 粉もん
  'お好み焼き': 'Okonomiyaki',
  'たこ焼き': 'Takoyaki',
  // 中華系
  '餃子': 'Gyoza',
  // 洋食
  'フレンチ': 'French',
  'ビストロ': 'Bistro',
  'スペイン料理': 'Spanish',
  'ステーキ': 'Steak',
  'ハンバーグ': 'Hamburg steak',
  'ハンバーガー': 'Burger',
  'ピザ': 'Pizza',
  // アジア・エスニック
  'タイ料理': 'Thai',
  'ベトナム料理': 'Vietnamese',
  'インド料理': 'Indian',
  'メキシカン': 'Mexican',
  // バー
  'バー': 'Bar',
  'ワインバー': 'Wine bar',
  // カフェ・甘味
  '喫茶店': 'Kissaten',
  'スイーツ': 'Sweets',
  'パン・ベーカリー': 'Bakery',
  // 食事系
  'カレー': 'Curry',
  '定食・食堂': 'Set meals / Diner',
  '丼もの': 'Donburi',
  // ホーム / カードで実際出てくるフリーフォーム値（追加）
  'ハワイアン': 'Hawaiian',
  'パンケーキ': 'Pancakes',
  'ベーカリー': 'Bakery',
  'パン': 'Bakery',
  '立ち飲み': 'Standing bar',
  '立ち呑み': 'Standing bar',
  '創作和食': 'Modern Japanese',
  'バーガー': 'Burger',
  '中華そば': 'Chuka Soba',
  'つけ麺': 'Tsukemen',
  '鮨': 'Sushi',
  'すし': 'Sushi',
  'ホルモン': 'Offal BBQ',
  'パスタ': 'Pasta',
  'ピッツァ': 'Pizza',
  'コーヒー': 'Coffee',
  'バル': 'Bar / Bistro',
  '中国料理': 'Chinese',
  '点心': 'Dim sum',
  '小籠包': 'Xiaolongbao',
  '韓国': 'Korean',
  'サムギョプサル': 'Samgyeopsal',
  'チゲ': 'Jjigae',
  'お弁当': 'Bento',
  'サンドイッチ': 'Sandwich',
  'ラーメン横綱': 'Ramen Yokozuna',
};

const SCENE_EN: Record<string, string> = {
  'ひとり': 'Solo',
  'デート': 'Date',
  '友達': 'Friends',
  '飲み': 'Drinks',
  'モーニング': 'Morning',
  'ランチ': 'Lunch',
  'ディナー': 'Dinner',
  // ホーム / カードに出てくる値（追加）
  'ひとり飲み': 'Solo drinks',
  '友達と': 'With friends',
  '深夜営業': 'Late night',
  '深夜': 'Late night',
  'テイクアウト': 'Takeout',
  '記念日': 'Anniversary',
  '飲み会': 'Drinks',
  'ナイト': 'Night',
  'カウンター': 'Counter',
  '夜景': 'Night view',
  '24時間': '24 hours',
  '夜': 'Night',
};

/**
 * テーマカード（id ベース）のラベル英訳。
 * `themes.ts` の `label` プロパティはフィルタロジック / URL / マッチング用に
 * JP のまま保持し、表示の時だけここから引く。
 */
const THEME_LABEL_EN: Record<string, string> = {
  solo: 'Solo drinks',
  date: 'Date night',
  friends: 'With friends',
  lunch: 'Lunch',
  'late-night': 'Late night',
  takeout: 'Takeout',
  // GENRES_AS_THEMES（ジャンル系）も同 helper で引けるようにしておく
  ramen: 'Ramen',
  sushi: 'Sushi',
  yakiniku: 'BBQ / Yakiniku',
  italian: 'Italian',
  cafe: 'Cafe',
  izakaya: 'Izakaya',
  chinese: 'Chinese',
  korean: 'Korean',
};

const THEME_DESC_EN: Record<string, string> = {
  solo: 'Counter-seat moods. Spots that feel right when you eat alone.',
  date: 'Atmosphere first. Restaurants for anniversaries and special nights.',
  friends: 'Loud, sharable, the vibe-up dinner spots.',
  lunch: 'Best bang for the yen. Quick weekday wins.',
  'late-night': "Open after the last train — when one more is needed.",
  takeout: 'Park, home, office. The to-go list.',
  ramen: 'A bowl of craft. Which one tonight?',
  sushi: 'Hand-pressed or kaiten — fresh fish, your call.',
  yakiniku: 'Reward dinners. Start with tongue.',
  italian: 'Pasta to pizza, trattoria to ristorante.',
  cafe: 'A coffee that lets you stay all afternoon.',
  izakaya: 'The usual pour and side after a long day.',
  chinese: 'Local Chinese to high-end dim sum — the deep menu.',
  korean: 'Samgyeopsal, jjigae, the real yangnyeom.',
};

const PREFECTURE_EN: Record<string, string> = {
  // 北海道・東北
  '北海道': 'Hokkaido', '青森県': 'Aomori', '岩手県': 'Iwate', '宮城県': 'Miyagi',
  '秋田県': 'Akita', '山形県': 'Yamagata', '福島県': 'Fukushima',
  // 関東
  '茨城県': 'Ibaraki', '栃木県': 'Tochigi', '群馬県': 'Gunma', '埼玉県': 'Saitama',
  '千葉県': 'Chiba', '東京都': 'Tokyo', '神奈川県': 'Kanagawa',
  // 中部
  '新潟県': 'Niigata', '富山県': 'Toyama', '石川県': 'Ishikawa', '福井県': 'Fukui',
  '山梨県': 'Yamanashi', '長野県': 'Nagano', '岐阜県': 'Gifu', '静岡県': 'Shizuoka', '愛知県': 'Aichi',
  // 近畿
  '三重県': 'Mie', '滋賀県': 'Shiga', '京都府': 'Kyoto', '大阪府': 'Osaka',
  '兵庫県': 'Hyogo', '奈良県': 'Nara', '和歌山県': 'Wakayama',
  // 中国
  '鳥取県': 'Tottori', '島根県': 'Shimane', '岡山県': 'Okayama', '広島県': 'Hiroshima', '山口県': 'Yamaguchi',
  // 四国
  '徳島県': 'Tokushima', '香川県': 'Kagawa', '愛媛県': 'Ehime', '高知県': 'Kochi',
  // 九州・沖縄
  '福岡県': 'Fukuoka', '佐賀県': 'Saga', '長崎県': 'Nagasaki', '熊本県': 'Kumamoto',
  '大分県': 'Oita', '宮崎県': 'Miyazaki', '鹿児島県': 'Kagoshima', '沖縄県': 'Okinawa',
};

export function localizeGenre(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return GENRE_EN[jp] ?? romanizeProperNoun(jp, lang);
}

export function localizeScene(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return SCENE_EN[jp] ?? romanizeProperNoun(jp, lang);
}

export function localizePrefecture(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return PREFECTURE_EN[jp] ?? romanizeProperNoun(jp, lang);
}

/**
 * カードの「チップ」表記用：genre と scene を混ぜた配列を表示する場面で
 * 値がどちらの辞書にあるか分からない時に使うフォールバック。
 * GENRE → SCENE → kana romaji の順で引く。
 */
export function localizeTag(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return GENRE_EN[jp] ?? SCENE_EN[jp] ?? romanizeProperNoun(jp, lang);
}

/**
 * テーマカードのラベル / 説明文を id ベースで引く。
 * 辞書未登録の id（autoGenreTheme で動的生成された未知ジャンル等）は
 * GENRE_EN → kana romaji にフォールバック。
 */
export function localizeThemeLabel(themeId: string, jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return THEME_LABEL_EN[themeId] ?? GENRE_EN[jp] ?? romanizeProperNoun(jp, lang);
}

export function localizeThemeDescription(themeId: string, jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return THEME_DESC_EN[themeId] ?? jp;
}

/**
 * 店名 / ニックネーム等の固有名詞を強制ローマ字化（EN 時のみ）。
 * 内部辞書を持たないので漢字混じりは中途半端な出力になる。
 * `Osaka みたいに` を仮名に対して可能な限り適用する best-effort。
 */
export function localizeProperNoun(jp: string, lang: Language): string {
  return romanizeProperNoun(jp, lang);
}
