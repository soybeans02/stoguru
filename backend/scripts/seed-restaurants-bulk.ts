/**
 * 大阪のモックレストラン 1000 件を自動生成 + 登録する bulk seed script。
 *
 * 使い方:
 *   cd backend
 *   npx tsx scripts/seed-restaurants-bulk.ts
 *   # ローカル backend に登録したい場合:
 *   API_URL=http://localhost:3001/api npx tsx scripts/seed-restaurants-bulk.ts
 *
 * 既存の seed-users.ts で test1〜test5@stoguru.dev のユーザーが
 * 作成済みである必要あり (5 ユーザーに分散して投稿)。
 *
 * 1000 件 × 5 ユーザー = 1ユーザーあたり 200 件くらい。
 * 並列度 8 で投げるので合計 3〜5 分で完了想定。
 */

import crypto from 'crypto';

const API = process.env.API_URL ?? 'https://stoguru-api.onrender.com/api';
const TOTAL = Number(process.env.TOTAL ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

const USERS = [
  { email: 'test1@stoguru.dev', password: 'Test1234!' },
  { email: 'test2@stoguru.dev', password: 'Test1234!' },
  { email: 'test3@stoguru.dev', password: 'Test1234!' },
  { email: 'test4@stoguru.dev', password: 'Test1234!' },
  { email: 'test5@stoguru.dev', password: 'Test1234!' },
];

// MARK: - ジャンル定義 (出現頻度の重み付き)

interface GenreSpec {
  label: string;
  weight: number;              // 出現比率
  priceRanges: string[];       // ランダムで選ぶ
  scenes: string[][];          // ランダムで 1 セット選ぶ
  namePrefixes: string[];      // 「{prefix} {area}店」など
  nameStyles: string[];        // 'modern' | 'classic' | 'place'
  photoIds: string[];          // Unsplash photo IDs (genre 一致)
  descTemplates: string[];     // 説明文テンプレート
}

const GENRES: GenreSpec[] = [
  {
    label: 'ラーメン', weight: 100,
    priceRanges: ['¥700〜¥1,000', '¥800〜¥1,200', '¥1,000〜¥1,500'],
    scenes: [['ひとり'], ['ひとり', '深夜'], ['友達', 'ひとり'], ['ランチ'], ['深夜', '〆']],
    namePrefixes: ['麺屋', '中華そば', 'らーめん', '濃厚', '極', '一', '麺処', '無双', '麺道'],
    nameStyles: ['modern', 'classic'],
    photoIds: ['1623341214825-9f4f963727da', '1569718212165-3a8278d5f624', '1591814468924-caf88d1232e1', '1617093727343-374698b1b08d'],
    descTemplates: [
      '{taste}スープが評判。深夜まで営業のカウンター主体の店。',
      '{taste}を看板に、{area}で長年愛される一杯。',
      '太麺の{taste}が看板メニュー。〆の一杯としても人気。',
      'カウンターのみ {seat} 席。{taste}が静かに沁みる。',
    ],
  },
  {
    label: '居酒屋', weight: 130,
    priceRanges: ['¥2,000〜¥3,500', '¥2,500〜¥4,500', '¥3,000〜¥5,000'],
    scenes: [['友達'], ['友達', '同僚'], ['飲み'], ['二次会'], ['ひとり', '飲み']],
    namePrefixes: ['炉端', '酒場', '居酒屋', '炭火焼', '串', '魚菜', '酒蔵', '一献', '杯', '味処', '酒'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1572116469696-31de0f17cc34', '1414235077428-338989a2e8c0', '1559339352-11d035aa65de'],
    descTemplates: [
      '{area} の路地裏にひっそり。{specialty}とお酒の組み合わせが鉄板。',
      '名物 {specialty} と地酒 {sake_count} 種。深夜まで賑やか。',
      '常連の多い {area} の名店。{specialty} を肴に一杯。',
      '炭火で焼く {specialty} が看板。落ち着いた大人の空間。',
    ],
  },
  {
    label: '焼肉', weight: 80,
    priceRanges: ['¥3,000〜¥5,000', '¥4,000〜¥8,000', '¥5,000〜¥10,000', '¥8,000〜¥15,000'],
    scenes: [['友達'], ['デート'], ['家族'], ['記念日'], ['接待']],
    namePrefixes: ['焼肉', 'ホルモン', '炭火焼肉', '和牛', '黒毛', '肉匠', '焼肉処'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1574484284002-952d92456975', '1546554137-f86b9593a222', '1582236001225-7d3ffe4b9d23'],
    descTemplates: [
      '黒毛和牛 A5 ランクを {priceWord} で。{seat} 席の人気店。',
      '希少部位が揃う {area} の肉名店。デートにも使える落ち着いた空間。',
      'ホルモン専門で深夜まで開店。{specialty} が看板。',
      '炭火で香り高く焼ける {specialty}。常連で賑わう。',
    ],
  },
  {
    label: '寿司', weight: 60,
    priceRanges: ['¥3,000〜¥5,000', '¥5,000〜¥10,000', '¥8,000〜¥15,000', '¥15,000〜¥30,000'],
    scenes: [['デート'], ['記念日'], ['接待'], ['家族']],
    namePrefixes: ['鮨', '寿司', '鮨処', '寿し', 'すし'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1583623025817-d180a2221d0a', '1579871494447-9811cf80d66c', '1553621042-f6e147245754'],
    descTemplates: [
      '{area} の隠れ家。おまかせコース {priceWord} で。',
      'カウンター {seat} 席のみ。江戸前の技を {area} で。',
      '地魚にこだわる { area } の名鮨。記念日に。',
      '若手の腕利き大将。コスパ良い{priceWord}おまかせが評判。',
    ],
  },
  {
    label: '和食', weight: 70,
    priceRanges: ['¥1,500〜¥3,000', '¥3,000〜¥6,000', '¥5,000〜¥10,000'],
    scenes: [['ランチ'], ['デート'], ['家族'], ['接待']],
    namePrefixes: ['和食', '日本料理', '小料理', '割烹', '懐石', '味', '京', '旬'],
    nameStyles: ['classic'],
    photoIds: ['1580959375944-abd7e991f971', '1617196034796-73dfa7b1fd56', '1611143669185-af224c5e3252'],
    descTemplates: [
      '旬の素材を活かした {area} の和食。{specialty} が定番。',
      '出汁にこだわる小料理屋。{specialty} と日本酒の相性が抜群。',
      '京風の繊細な味わい。ランチの {priceWord} 定食もお得。',
      '個室完備。落ち着いた接待にも使える {area} の老舗。',
    ],
  },
  {
    label: '中華', weight: 70,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥3,000', '¥2,000〜¥4,000'],
    scenes: [['友達'], ['家族'], ['ランチ'], ['ひとり']],
    namePrefixes: ['中華', '中国料理', '飯店', '楼', '園', '香味', '老'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1525755662778-989d0524087e', '1582450871972-ab5ca641643d', '1563379091339-03b21ab4a4f8'],
    descTemplates: [
      '本場の {specialty} と {drink} の組み合わせ。{area} で長く愛される町中華。',
      '名物 {specialty} を頬張る一軒。気軽に立ち寄れる空気感。',
      '本格四川の辛さに痺れる。{specialty} がオススメ。',
      '飲茶ランチが {priceWord} で楽しめる。家族連れにも人気。',
    ],
  },
  {
    label: 'イタリアン', weight: 70,
    priceRanges: ['¥1,500〜¥3,000', '¥2,500〜¥5,000', '¥4,000〜¥8,000'],
    scenes: [['デート'], ['友達'], ['ランチ'], ['記念日']],
    namePrefixes: ['Trattoria', 'Osteria', 'Pizzeria', 'リストランテ', 'カンティーナ', '小さな', 'イル'],
    nameStyles: ['modern', 'place'],
    photoIds: ['1481070555726-e2fe8357725c', '1551183053-bf91a1d81141', '1565299624946-b28f40a0ae38'],
    descTemplates: [
      '薪窯で焼く本格ピッツァが看板。{area} のカジュアル伊。',
      'シェフが {area} に出店。{specialty} の手打ちパスタが絶品。',
      'デートに最適な{seat}席のカウンター。{specialty} のコース {priceWord}。',
      '昼の {priceWord} ランチが好評。{specialty}メインのコース。',
    ],
  },
  {
    label: 'カフェ', weight: 100,
    priceRanges: ['¥500〜¥1,000', '¥800〜¥1,500', '¥1,000〜¥2,000'],
    scenes: [['ひとり'], ['ひとり', '朝活'], ['友達', 'ランチ'], ['ひとり', '読書']],
    namePrefixes: ['Café', 'コーヒー', '喫茶', '珈琲', 'BREW', 'Roastery', 'Brews', 'Beans', '珈琲店'],
    nameStyles: ['modern', 'classic', 'place'],
    photoIds: ['1495474472287-4d71bcdd2085', '1554118811-1e0d58224f24', '1453614512568-c4024d13c247'],
    descTemplates: [
      '自家焙煎の {drink} と {sweet}。{area} の隠れ家カフェ。',
      'ノマド向けの {seat} 席ある喫茶。Wi-Fi 電源完備。',
      '朝 {priceWord} のモーニングが評判。{sweet} 自家製。',
      '深夜まで開店。読書に向いた静かな {area} のカフェ。',
    ],
  },
  {
    label: '韓国料理', weight: 50,
    priceRanges: ['¥1,500〜¥3,000', '¥2,500〜¥5,000'],
    scenes: [['友達'], ['女子会'], ['飲み'], ['デート']],
    namePrefixes: ['韓国', 'チキン', 'マシッソ', 'ソウル', '本場', 'コリアン'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1583224874284-a3d7e4f6a4e3', '1583224964978-2a32a6428da9', '1568901346375-23c9450c58cd'],
    descTemplates: [
      '本場 {specialty} の専門店。{area} で人気の韓国料理。',
      'サムギョプサルとマッコリの組み合わせ。{seat} 席で女子会向き。',
      '韓国チキン専門。テイクアウトも可能。',
      '深夜まで開店。{specialty} と {drink} で乾杯。',
    ],
  },
  {
    label: '洋食', weight: 50,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥3,000', '¥2,500〜¥5,000'],
    scenes: [['ランチ'], ['家族'], ['ひとり'], ['デート']],
    namePrefixes: ['洋食', 'グリル', 'キッチン', '食堂', 'Bistro', 'Brasserie'],
    nameStyles: ['classic', 'modern'],
    photoIds: ['1546069901-ba9599a7e63c', '1565299624946-b28f40a0ae38', '1559339352-11d035aa65de'],
    descTemplates: [
      '昭和から続く老舗洋食店。{specialty} の {priceWord}定食 が看板。',
      'シェフのこだわり {specialty} と自家製ソース。{area} の隠れた名店。',
      'ランチ {priceWord} で人気。{specialty} メインのセット。',
      'カウンター主体の {seat} 席。ひとり洋食にも使える。',
    ],
  },
  {
    label: 'バー', weight: 60,
    priceRanges: ['¥2,000〜¥4,000', '¥3,000〜¥6,000', '¥5,000〜¥10,000'],
    scenes: [['ひとり'], ['二次会'], ['デート'], ['深夜']],
    namePrefixes: ['Bar', '酒蔵', 'スタンド', 'ウイスキー', 'カクテル', 'Lounge', 'スコッチ'],
    nameStyles: ['modern', 'classic'],
    photoIds: ['1543007631-283050bb3e8c', '1572116469696-31de0f17cc34', '1566417713940-fe7c737a9ef2'],
    descTemplates: [
      'ウイスキー {sake_count} 種以上。深夜 3 時まで営業の {area} のバー。',
      '一人で来やすいカウンター {seat} 席のオーセンティック。',
      'マスター手作りカクテルが評判。{area} の路地裏に。',
      '葉巻 OK。落ち着いた大人の隠れ家。',
    ],
  },
  {
    label: 'たこ焼き', weight: 30,
    priceRanges: ['¥500〜¥1,000', '¥700〜¥1,200'],
    scenes: [['友達'], ['ひとり'], ['テイクアウト']],
    namePrefixes: ['たこ焼き', 'たこ家', '元祖', '本家'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1577303935007-0d306ee638cf', '1601050690597-df0568f70950'],
    descTemplates: [
      '大阪定番の {specialty}。{area} で 50 年続く老舗。',
      'カウンター {seat} 席のみ。地元客で賑わう。',
      '深夜まで開店。{drink} と一緒に。',
    ],
  },
  {
    label: 'お好み焼き', weight: 40,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥2,500'],
    scenes: [['友達'], ['家族'], ['観光']],
    namePrefixes: ['お好み焼き', 'お好み', '鉄板', 'ぼちぼち', 'ねぎ焼き'],
    nameStyles: ['classic'],
    photoIds: ['1582450871972-ab5ca641643d', '1546069901-ba9599a7e63c'],
    descTemplates: [
      '名物 {specialty} と {drink}。{area} で 30 年営業。',
      '鉄板を囲んで楽しむ。家族連れにも人気。',
      'ねぎ焼き発祥店。{specialty} の食感が違う。',
    ],
  },
  {
    label: '串カツ', weight: 40,
    priceRanges: ['¥1,500〜¥3,000', '¥2,000〜¥4,000'],
    scenes: [['友達'], ['ひとり'], ['飲み']],
    namePrefixes: ['串カツ', '串', '串揚げ', '揚げ屋', '元祖'],
    nameStyles: ['classic'],
    photoIds: ['1582450871972-ab5ca641643d', '1572116469696-31de0f17cc34'],
    descTemplates: [
      '新世界スタイルの {specialty}。1 本 100 円から。',
      'カウンター {seat} 席のみ。立ち呑み感覚で。',
      '揚げ立てを次々と出す店。{drink} に合う。',
    ],
  },
  {
    label: 'うどん', weight: 50,
    priceRanges: ['¥700〜¥1,200', '¥1,000〜¥1,800'],
    scenes: [['ランチ'], ['ひとり'], ['朝食']],
    namePrefixes: ['うどん', 'はなまる', '釜揚げ', '讃岐', '手打ち', '本'],
    nameStyles: ['classic'],
    photoIds: ['1612929633738-8fe44f7ec841', '1623341214825-9f4f963727da'],
    descTemplates: [
      '讃岐スタイルの {specialty}。手打ち麺の食感が魅力。',
      '出汁にこだわる {area} の名店。朝から営業。',
      'ランチ {priceWord} の天ぷらうどんセットが人気。',
    ],
  },
  {
    label: 'そば', weight: 35,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥3,000'],
    scenes: [['ひとり'], ['ランチ'], ['デート']],
    namePrefixes: ['蕎麦', '手打ち蕎麦', '十割', '二八', 'そば処', '蕎麦切り'],
    nameStyles: ['classic'],
    photoIds: ['1612929633738-8fe44f7ec841', '1580959375944-abd7e991f971'],
    descTemplates: [
      '十割そばの香りが立つ {area} の名店。{specialty} が看板。',
      '昼酒の聖地。{specialty} と日本酒の組み合わせ。',
      '手打ちにこだわる {seat} 席の小さな店。',
    ],
  },
  {
    label: '立ち呑み', weight: 35,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥2,500'],
    scenes: [['ひとり'], ['同僚'], ['飲み'], ['二次会']],
    namePrefixes: ['立ち呑み', 'スタンド', '一杯', 'ちょい', '酒場'],
    nameStyles: ['classic', 'place'],
    photoIds: ['1572116469696-31de0f17cc34', '1543007631-283050bb3e8c'],
    descTemplates: [
      '{specialty} と {drink} の組み合わせ。ふらっと一杯。',
      '京橋・天満エリアの名物立ち呑み。深夜まで賑やか。',
      'カウンターのみの小さな店。常連と肩を並べて。',
    ],
  },
  {
    label: 'インド料理', weight: 25,
    priceRanges: ['¥1,000〜¥2,000', '¥1,500〜¥3,000'],
    scenes: [['ランチ'], ['友達'], ['家族']],
    namePrefixes: ['インド料理', 'ナマステ', 'タージ', 'ヒマラヤ', 'スパイス', 'カレーハウス'],
    nameStyles: ['classic'],
    photoIds: ['1585937421612-70a008356fbe', '1565557623262-b51c2513a641'],
    descTemplates: [
      'ナン食べ放題ランチが {priceWord} で。{specialty} がコクある。',
      '本格スパイスを使う {area} の老舗。{specialty} とラッシーの組合せ。',
      'インド・ネパール料理。テイクアウトも可。',
    ],
  },
];

// MARK: - エリア / 駅

const AREAS = [
  // 北エリア
  { name: '梅田',    lat: 34.7025, lng: 135.4959, weight: 18 },
  { name: '中之島',  lat: 34.6940, lng: 135.4944, weight: 6 },
  { name: '北新地',  lat: 34.6985, lng: 135.4978, weight: 8 },
  { name: '天満',    lat: 34.7060, lng: 135.5180, weight: 7 },
  { name: '京橋',    lat: 34.6970, lng: 135.5350, weight: 8 },
  { name: '大阪駅',  lat: 34.7026, lng: 135.4959, weight: 10 },
  // 中央エリア
  { name: '難波',    lat: 34.6660, lng: 135.5010, weight: 15 },
  { name: '心斎橋',  lat: 34.6735, lng: 135.5010, weight: 12 },
  { name: '本町',    lat: 34.6845, lng: 135.4990, weight: 6 },
  { name: '堀江',    lat: 34.6720, lng: 135.4920, weight: 6 },
  { name: '南船場',  lat: 34.6770, lng: 135.5010, weight: 5 },
  { name: '北浜',    lat: 34.6900, lng: 135.5070, weight: 5 },
  { name: '日本橋',  lat: 34.6630, lng: 135.5070, weight: 5 },
  // 西エリア
  { name: '靱本町',  lat: 34.6840, lng: 135.4900, weight: 4 },
  { name: '新町',    lat: 34.6790, lng: 135.4920, weight: 4 },
  // 南エリア
  { name: '阿倍野',  lat: 34.6450, lng: 135.5140, weight: 7 },
  { name: '天王寺',  lat: 34.6460, lng: 135.5160, weight: 9 },
  { name: '新世界',  lat: 34.6520, lng: 135.5060, weight: 5 },
  { name: '恵美須町', lat: 34.6555, lng: 135.5060, weight: 4 },
  // 東エリア
  { name: '玉造',    lat: 34.6810, lng: 135.5340, weight: 4 },
  { name: '森ノ宮',  lat: 34.6810, lng: 135.5310, weight: 3 },
  // 港エリア
  { name: '弁天町',  lat: 34.6680, lng: 135.4640, weight: 3 },
  { name: '九条',    lat: 34.6710, lng: 135.4760, weight: 3 },
  // 北西
  { name: '福島',    lat: 34.6975, lng: 135.4860, weight: 6 },
  { name: '野田',    lat: 34.6960, lng: 135.4720, weight: 4 },
];

const SCENES_ALL = ['ひとり', '友達', '同僚', 'デート', '家族', '飲み', '深夜', '記念日', '接待', '二次会', 'ランチ', 'ディナー', '朝食', '女子会', '観光', '読書', '朝活'];

// MARK: - 名前ジェネレータ

const SUFFIXES_PLACE = ['梅田店', '難波店', '心斎橋店', '本町店', '京橋店', '天王寺店', '阿倍野店', '北新地店', '新世界店', '中之島店', '本店'];
const SUFFIXES_CLASSIC = ['', '亭', '屋', '庵', '舎', '堂'];
const SUFFIXES_MODERN = ['& Co.', '+', 'BREW', 'LAB', 'STAND', ''];
const PERSONAL = ['信吉', '銀次郎', '弥助', '太郎', '北吉', '宗八', '喜兵衛', '一徹', '三平', '正吉', '寛斎', '宗助', '善蔵', '吉田', '小林', '田中', '佐藤', '中村', '山本', '渡辺'];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length > 0) {
    const idx = Math.floor(Math.random() * a.length);
    out.push(a.splice(idx, 1)[0]);
  }
  return out;
}

function makeName(genre: GenreSpec, area: string): string {
  const style = pick(genre.nameStyles);
  const prefix = pick(genre.namePrefixes);
  if (style === 'place') return `${prefix} ${area}店`;
  if (style === 'modern') return `${prefix} ${pick(SUFFIXES_MODERN)}`.trim();
  // classic: 人名 or 漢字接尾
  if (Math.random() < 0.4) return `${prefix} ${pick(PERSONAL)}`;
  return `${prefix}${pick(SUFFIXES_CLASSIC)}`.trim();
}

function makeAddress(area: string): string {
  const chome = Math.floor(Math.random() * 4) + 1;
  const ban = Math.floor(Math.random() * 30) + 1;
  const go = Math.floor(Math.random() * 30) + 1;
  return `大阪市${pickArea(area)}${area}${chome}-${ban}-${go}`;
}
function pickArea(area: string): string {
  // 簡易マッピング (本当は正確な区情報あるとよりリアルだがここは雰囲気)
  if (['梅田', '中之島', '北新地', '天満', '大阪駅', '福島', '野田'].includes(area)) return '北区 ';
  if (['難波', '心斎橋', '本町', '南船場', '北浜', '日本橋'].includes(area)) return '中央区 ';
  if (['堀江', '靱本町', '新町', '九条', '弁天町'].includes(area)) return '西区 ';
  if (['阿倍野', '天王寺'].includes(area)) return '阿倍野区 ';
  if (['新世界', '恵美須町'].includes(area)) return '浪速区 ';
  if (['玉造', '森ノ宮', '京橋'].includes(area)) return '都島区 ';
  return '';
}

function jitter(base: number, range: number): number {
  return Math.round((base + (Math.random() - 0.5) * range) * 10000) / 10000;
}

function makeDescription(tpl: string, area: string, genre: GenreSpec): string {
  const tastes = ['あっさり醤油', '濃厚豚骨', '味噌', '塩', '辛味噌', 'つけ麺', '汁なし'];
  const specialties = ['炙り和牛', 'もつ鍋', 'おでん', '串カツ', '海鮮丼', '鴨ロース', '鯖の棒寿司', '炭火焼き', '生牡蠣', '土鍋ご飯', 'パスタ', 'ピザ', 'カレー', '玉子焼き'];
  const drinks = ['日本酒', '焼酎', 'ハイボール', 'クラフトビール', '紹興酒', 'ワイン', '梅酒'];
  const sweets = ['プリン', 'チーズケーキ', 'スコーン', 'マフィン', 'クッキー'];
  const seats = ['4', '6', '8', '10', '12'];
  const priceWords = ['¥1,000 台', '¥1,500 前後', '¥2,000 程度', 'お得な値段'];
  const sakeCounts = ['30', '50', '80', '100'];
  return tpl
    .replace(/\{area\}/g, area)
    .replace(/\{taste\}/g, pick(tastes))
    .replace(/\{specialty\}/g, pick(specialties))
    .replace(/\{drink\}/g, pick(drinks))
    .replace(/\{sweet\}/g, pick(sweets))
    .replace(/\{seat\}/g, pick(seats))
    .replace(/\{priceWord\}/g, pick(priceWords))
    .replace(/\{sake_count\}/g, pick(sakeCounts));
}

function makePhotos(genre: GenreSpec, count = 3): string[] {
  // 同じ photoId 何回でも OK だが重複しないように選ぶ
  const ids = pickN(genre.photoIds, Math.min(count, genre.photoIds.length));
  return ids.map((id) =>
    `https://images.unsplash.com/photo-${id}?w=800&h=1200&fit=crop&q=80`
  );
}

interface GeneratedRestaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genres: string[];
  scene: string[];
  priceRange: string;
  photoUrls: string[];
  urls: string[];
  description: string;
  visibility: string;
}

function generateRestaurants(n: number): GeneratedRestaurant[] {
  const out: GeneratedRestaurant[] = [];
  for (let i = 0; i < n; i++) {
    const genre = pickWeighted(GENRES);
    const area = pickWeighted(AREAS);
    const name = makeName(genre, area.name);
    const tpl = pick(genre.descTemplates);
    const description = makeDescription(tpl, area.name, genre);
    out.push({
      id: crypto.randomUUID(),
      name,
      address: makeAddress(area.name),
      lat: jitter(area.lat, 0.012),
      lng: jitter(area.lng, 0.012),
      genres: [genre.label],
      scene: pickN(pick(genre.scenes), pick(genre.scenes).length),
      priceRange: pick(genre.priceRanges),
      photoUrls: makePhotos(genre, Math.random() < 0.5 ? 3 : 2),
      urls: [`https://www.instagram.com/${name.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'osaka_eats'}/`],
      description,
      visibility: 'public',
    });
  }
  return out;
}

// MARK: - HTTP 呼出 (login + putRestaurant)

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { accessToken: string };
  return data.accessToken;
}

async function putRestaurant(token: string, r: GeneratedRestaurant): Promise<boolean> {
  const body = JSON.stringify({
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    genres: r.genres,
    scene: r.scene,
    priceRange: r.priceRange,
    photoUrls: r.photoUrls,
    urls: r.urls,
    description: r.description,
    visibility: r.visibility,
  });
  // rate limit (429) は指数バックオフで最大 5 回まで再試行
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/influencer/restaurants/${r.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    if (res.ok) return true;
    if (res.status === 429) {
      // 書き込み limit は windowMs=60s なので最低 60s 待つ + 揺らぎ
      const wait = 60_000 + Math.random() * 5000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return false;  // 429 以外は再試行しても無駄
  }
  return false;
}

// 並列度制限付きの map (CONCURRENCY 個ずつ実行)
async function parallelMap<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  console.log(`🍽️  bulk seed: ${TOTAL} 件 × ${USERS.length} ユーザー (並列度 ${CONCURRENCY})`);
  console.log(`API: ${API}\n`);

  // ログイン
  const tokens: string[] = [];
  for (const u of USERS) {
    try {
      tokens.push(await login(u.email, u.password));
      console.log(`🔑 ${u.email}`);
    } catch (e) {
      console.error(`❌ ${u.email}:`, (e as Error).message);
    }
  }
  if (tokens.length === 0) {
    console.error('\n❌ ログインできるユーザーゼロ。先に seed-users.ts を流して。');
    return;
  }

  // 1000 件生成
  const restaurants = generateRestaurants(TOTAL);
  console.log(`\n📦 ${restaurants.length} 件 生成完了`);
  // ジャンル別カウントを表示
  const byGenre: Record<string, number> = {};
  restaurants.forEach((r) => { byGenre[r.genres[0]] = (byGenre[r.genres[0]] ?? 0) + 1; });
  Object.entries(byGenre)
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, n]) => console.log(`  ${g.padEnd(10)} ${n}`));

  // 投稿
  console.log(`\n🚀 投稿開始...`);
  let okCount = 0;
  let ngCount = 0;
  const startTs = Date.now();

  await parallelMap(restaurants, CONCURRENCY, async (r, idx) => {
    const token = tokens[idx % tokens.length];
    const ok = await putRestaurant(token, r);
    if (ok) okCount++; else ngCount++;
    if ((okCount + ngCount) % 50 === 0) {
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
      console.log(`  ${okCount + ngCount}/${restaurants.length}  (${elapsed}s, OK=${okCount} NG=${ngCount})`);
    }
  });

  console.log(`\n✨ 完了!  OK=${okCount}  NG=${ngCount}  時間=${((Date.now() - startTs) / 1000).toFixed(1)}秒`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
