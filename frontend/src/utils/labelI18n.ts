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
};

const SCENE_EN: Record<string, string> = {
  'ひとり': 'Solo',
  'デート': 'Date',
  '友達': 'Friends',
  '飲み': 'Drinks',
  'モーニング': 'Morning',
  'ランチ': 'Lunch',
  'ディナー': 'Dinner',
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
  return GENRE_EN[jp] ?? jp;
}

export function localizeScene(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return SCENE_EN[jp] ?? jp;
}

export function localizePrefecture(jp: string, lang: Language): string {
  if (lang === 'ja') return jp;
  return PREFECTURE_EN[jp] ?? jp;
}
